import crypto from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config, isProduction } from './config.js';
import { pool } from './db.js';
import { createSessionToken, setSessionCookie } from './session.js';
import { findUserByEmail, findUserById } from './user-adapter.js';
import { createOAuthUser } from './account-write-adapter.js';
import { detectOauthIdentityCompatibility, findOauthIdentity, linkOauthIdentity } from './oauth-identities.js';

export const googleAuthRouter = Router();

function oauthClient() {
  return new OAuth2Client(config.googleClientId, config.googleClientSecret, config.googleCallbackUrl);
}

export function safeStateEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  };
}

function clearState(res) {
  res.clearCookie(config.googleStateCookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

function loginError(res, code) {
  clearState(res);
  return res.redirect(`/login.html?error=${encodeURIComponent(code)}`);
}

googleAuthRouter.get('/auth/google', (_req, res) => {
  if (!config.googleOAuthReady) return res.status(503).json({ ok: false, error: 'google_oauth_not_ready' });

  const state = crypto.randomBytes(32).toString('base64url');
  res.cookie(config.googleStateCookieName, state, stateCookieOptions());
  const url = oauthClient().generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
  return res.redirect(url);
});

googleAuthRouter.get('/auth/google/callback', async (req, res) => {
  if (!config.googleOAuthReady) return loginError(res, 'google_oauth_not_ready');

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const expectedState = req.cookies?.[config.googleStateCookieName] || '';
  if (!safeStateEqual(state, expectedState)) return loginError(res, 'google_state_invalid');

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return loginError(res, 'google_code_missing');

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return loginError(res, 'google_identity_missing');

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.googleClientId,
    });
    const profile = ticket.getPayload();
    const email = profile?.email?.trim().toLowerCase() || '';
    const subject = profile?.sub ? String(profile.sub) : '';
    if (!email || profile?.email_verified !== true) return loginError(res, 'google_email_unverified');
    if (!subject) return loginError(res, 'google_identity_missing');

    const identityStatus = await detectOauthIdentityCompatibility();
    let user = null;

    if (identityStatus.ready) {
      const db = await pool.connect();
      try {
        await db.query('begin');
        const identity = await findOauthIdentity({ provider: 'google', subject }, db);
        if (identity) {
          user = await findUserById(identity.userId, db);
          if (!user) throw new Error('oauth identity user missing');
        } else {
          user = await findUserByEmail(email, db);
          if (!user) {
            if (!config.googleAutoRegisterEnabled || !config.userWritesEnabled) {
              await db.query('rollback');
              return loginError(res, 'google_account_not_registered');
            }
            user = await createOAuthUser({ email, name: profile?.name || null }, db);
          }
          await linkOauthIdentity({ provider: 'google', subject, userId: user.id, email }, db);
        }
        await db.query('commit');
      } catch (error) {
        await db.query('rollback').catch(() => null);
        throw error;
      } finally {
        db.release();
      }
    } else {
      // Migration 013 uygulanmadan önce yalnız doğrulanmış e-postayla mevcut hesaba giriş korunur; otomatik kayıt açılmaz.
      user = await findUserByEmail(email);
      if (!user) return loginError(res, 'google_account_not_registered');
    }

    const sessionToken = createSessionToken({ ...user, name: user.name || profile?.name || null });
    setSessionCookie(res, sessionToken);
    clearState(res);
    return res.redirect('/dashboard.html?google=success');
  } catch (error) {
    console.error('[KOTAKAS] google oauth error:', error?.message || error);
    return loginError(res, 'google_oauth_failed');
  }
});

import crypto from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config, isProduction } from './config.js';
import { createSessionToken, setSessionCookie } from './session.js';
import { findUserByEmail } from './user-adapter.js';

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
    if (!email || profile?.email_verified !== true) return loginError(res, 'google_email_unverified');

    const user = await findUserByEmail(email);
    if (!user) {
      const codeName = config.googleAutoRegisterEnabled ? 'google_registration_adapter_not_ready' : 'google_account_not_registered';
      return loginError(res, codeName);
    }

    const token = createSessionToken({ ...user, name: user.name || profile?.name || null });
    setSessionCookie(res, token);
    clearState(res);
    return res.redirect('/dashboard.html?google=success');
  } catch (error) {
    console.error('[KOTAKAS] google oauth error:', error?.message || error);
    return loginError(res, 'google_oauth_failed');
  }
});

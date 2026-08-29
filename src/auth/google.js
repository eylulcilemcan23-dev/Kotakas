import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createSessionToken, setSessionCookie } from './session.js';
import { landingPathForRole } from './panel-access.js';

function signState(jwtSecret, nextPath = '/') {
  const safeNext = String(nextPath || '/').startsWith('/') ? String(nextPath || '/') : '/';
  return jwt.sign(
    { typ: 'google_oauth_state', nonce: crypto.randomBytes(16).toString('hex'), next: safeNext },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: 600, issuer: 'kotakas' }
  );
}

function verifyState(token, jwtSecret) {
  const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: 'kotakas' });
  if (payload?.typ !== 'google_oauth_state') throw new Error('invalid_oauth_state');
  return payload;
}

export function createGoogleAuthRouter({ users, config }) {
  const router = express.Router();

  router.get('/auth/google', (req, res) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      return res.status(503).send('Google ile giriş henüz yapılandırılmadı.');
    }

    const state = signState(config.jwtSecret, req.query?.next || '/');
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state
    });
    return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/auth/google/callback', async (req, res, next) => {
    try {
      if (req.query?.error) return res.redirect(302, '/login.html?error=google_cancelled');
      if (!req.query?.code || !req.query?.state) return res.redirect(302, '/login.html?error=google_invalid');

      const state = verifyState(String(req.query.state), config.jwtSecret);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          code: String(req.query.code),
          grant_type: 'authorization_code',
          redirect_uri: config.googleCallbackUrl
        })
      });
      if (!tokenResponse.ok) throw new Error('google_token_exchange_failed');
      const tokens = await tokenResponse.json();
      if (!tokens.access_token) throw new Error('google_access_token_missing');

      const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token}` }
      });
      if (!userInfoResponse.ok) throw new Error('google_userinfo_failed');
      const profile = await userInfoResponse.json();
      if (!profile.email || profile.email_verified === false) throw new Error('google_email_not_verified');

      let authUser = await users.findAuthUserByEmail(profile.email);
      let user = authUser?.user || null;
      if (!user) {
        const impossiblePassword = crypto.randomBytes(48).toString('base64url');
        const passwordHash = await bcrypt.hash(impossiblePassword, 12);
        user = await users.createUser({
          email: profile.email,
          passwordHash,
          displayName: String(profile.name || profile.email.split('@')[0]).slice(0, 80),
          role: 'user'
        });
      }
      if (!user?.active) return res.redirect(302, '/login.html?error=account_disabled');

      const token = createSessionToken({ userId: user.id, jwtSecret: config.jwtSecret });
      setSessionCookie(res, token, config.production);
      await users.touchLastLogin(user.id);

      const requested = String(state.next || '/');
      const target = requested !== '/' ? requested : landingPathForRole(user.role);
      return res.redirect(302, target);
    } catch (error) {
      console.error('[KOTAKAS] Google OAuth error', error?.message || error);
      return res.redirect(302, '/login.html?error=google_login_failed');
    }
  });

  return router;
}

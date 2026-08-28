import { Router } from 'express';
import { config } from './config.js';
import { createSessionToken, clearSessionCookie, setSessionCookie } from './session.js';
import { findUserByEmail, publicUser, verifyUserPassword } from './user-adapter.js';

export const authRouter = Router();

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateLoginInput(body = {}) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !email.includes('@')) {
    return { ok: false, error: 'invalid_credentials' };
  }
  if (!password || password.length > 512) {
    return { ok: false, error: 'invalid_credentials' };
  }
  return { ok: true, email, password };
}

authRouter.post('/login', async (req, res) => {
  if (!config.legacyLoginEnabled) {
    return res.status(503).json({ ok: false, error: 'legacy_login_disabled' });
  }
  if (!config.databaseUrl || !config.jwtSecret) {
    return res.status(503).json({ ok: false, error: 'authentication_not_ready' });
  }

  const input = validateLoginInput(req.body);
  if (!input.ok) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

  try {
    const user = await findUserByEmail(input.email);
    const valid = user ? await verifyUserPassword(user, input.password) : false;
    if (!valid) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

    const token = createSessionToken(user);
    setSessionCookie(res, token);
    return res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    console.error('[KOTAKAS] login compatibility error:', error?.message || error);
    return res.status(503).json({ ok: false, error: 'authentication_temporarily_unavailable' });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

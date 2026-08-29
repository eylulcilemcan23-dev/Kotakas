import express from 'express';
import bcrypt from 'bcryptjs';
import { normalizeEmail, validateRegistrationInput } from './users.js';
import { clearSessionCookie, createSessionToken, setSessionCookie } from './session.js';
import { createIpRateLimit } from '../security/rate-limit.js';

function authResponse(user) {
  return {
    ok: true,
    authenticated: Boolean(user),
    user: user || null
  };
}

function duplicateEmail(error) {
  return error?.code === '23505' || /unique|duplicate/i.test(String(error?.message || ''));
}

export function createAuthRouter({ users, jwtSecret, production }) {
  const router = express.Router();
  const loginLimit = createIpRateLimit({ windowMs: 60_000, max: 12 });
  const registerLimit = createIpRateLimit({ windowMs: 10 * 60_000, max: 6 });

  async function register(req, res, next) {
    try {
      const validation = validateRegistrationInput(req.body || {});
      if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error });

      const { email, password, displayName } = validation.value;
      const existing = await users.findAuthUserByEmail(email);
      if (existing) return res.status(409).json({ ok: false, error: 'email_already_registered' });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await users.createUser({
        email,
        passwordHash,
        displayName,
        role: 'user'
      });

      const token = createSessionToken({ userId: user.id, jwtSecret });
      setSessionCookie(res, token, production);
      return res.status(201).json(authResponse(user));
    } catch (error) {
      if (duplicateEmail(error)) return res.status(409).json({ ok: false, error: 'email_already_registered' });
      return next(error);
    }
  }

  async function login(req, res, next) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');
      if (!email || !password) return res.status(400).json({ ok: false, error: 'email_and_password_required' });

      const authUser = await users.findAuthUserByEmail(email);
      if (!authUser?.user?.active) {
        return res.status(401).json({ ok: false, error: 'invalid_credentials' });
      }

      const hash = String(authUser.passwordHash || '');
      if (!/^\$2[aby]\$/.test(hash)) {
        return res.status(409).json({ ok: false, error: 'password_migration_required' });
      }

      const correct = await bcrypt.compare(password, hash);
      if (!correct) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

      const token = createSessionToken({ userId: authUser.user.id, jwtSecret });
      setSessionCookie(res, token, production);
      await users.touchLastLogin(authUser.user.id);
      return res.json(authResponse(authUser.user));
    } catch (error) {
      return next(error);
    }
  }

  function logout(_req, res) {
    clearSessionCookie(res, production);
    return res.json({ ok: true });
  }

  function me(req, res) {
    return res.json(authResponse(req.user));
  }

  router.post('/register', registerLimit, register);
  router.post('/auth/register', registerLimit, register);
  router.post('/login', loginLimit, login);
  router.post('/auth/login', loginLimit, login);
  router.post('/logout', logout);
  router.post('/auth/logout', logout);
  router.get('/me', me);
  router.get('/auth/me', me);

  return router;
}

import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { config } from './config.js';
import { createSessionToken, setSessionCookie } from './session.js';
import { createLocalUser, detectAccountWriteCompatibility, updateUserPasswordByEmail } from './account-write-adapter.js';

export const accountRouter = Router();

export function normalizeAccountEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validatePassword(value) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 10 || password.length > 128) return { ok: false, error: 'password_policy' };
  return { ok: true, password };
}

export function validateRegistrationInput(body = {}) {
  const email = normalizeAccountEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const passwordCheck = validatePassword(body.password);
  if (!email || email.length > 254 || !email.includes('@')) return { ok: false, error: 'invalid_email' };
  if (!passwordCheck.ok) return passwordCheck;
  return { ok: true, email, password: passwordCheck.password, name: name || null };
}

export function createPasswordResetToken(email, secret = config.passwordResetSecret) {
  if (!secret) throw new Error('PASSWORD_RESET_SECRET missing');
  return jwt.sign(
    { purpose: 'password_reset', email: normalizeAccountEmail(email) },
    secret,
    { expiresIn: config.passwordResetTtl },
  );
}

export function verifyPasswordResetToken(token, secret = config.passwordResetSecret) {
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret);
    if (payload?.purpose !== 'password_reset') return null;
    const email = normalizeAccountEmail(payload.email);
    return email ? { email } : null;
  } catch {
    return null;
  }
}

accountRouter.get('/account/capabilities', async (_req, res) => {
  let schemaReady = false;
  try {
    schemaReady = (await detectAccountWriteCompatibility()).ready;
  } catch {
    schemaReady = false;
  }
  res.json({
    ok: true,
    registrationEnabled: config.registrationEnabled,
    registrationReady: Boolean(config.registrationEnabled && config.userWritesEnabled && schemaReady),
    passwordResetEnabled: config.passwordResetEnabled,
    passwordResetReady: Boolean(config.passwordResetEnabled && config.userWritesEnabled && config.passwordResetSecret && config.passwordResetDeliveryEnabled && schemaReady),
  });
});

accountRouter.post('/register', async (req, res) => {
  if (!config.registrationEnabled || !config.userWritesEnabled) {
    return res.status(503).json({ ok: false, error: 'registration_disabled' });
  }
  const input = validateRegistrationInput(req.body);
  if (!input.ok) return res.status(400).json({ ok: false, error: input.error });

  try {
    const user = await createLocalUser(input);
    const token = createSessionToken(user);
    setSessionCookie(res, token);
    return res.status(201).json({ ok: true, user });
  } catch (error) {
    const code = error?.message === 'email_already_registered' ? 'email_already_registered' : 'registration_temporarily_unavailable';
    const status = code === 'email_already_registered' ? 409 : 503;
    if (status === 503) console.error('[KOTAKAS] registration compatibility error:', error?.message || error);
    return res.status(status).json({ ok: false, error: code });
  }
});

accountRouter.post('/password-reset/request', async (req, res) => {
  if (!config.passwordResetEnabled || !config.passwordResetDeliveryEnabled || !config.passwordResetSecret) {
    return res.status(503).json({ ok: false, error: 'password_reset_not_ready' });
  }

  // Hesap var/yok bilgisini disariya sizdirmamak icin bu endpoint her zaman ayni cevabi verir.
  // E-posta teslim adaptorunun sonraki fazda createPasswordResetToken() ile baglanmasi planlanir.
  const email = normalizeAccountEmail(req.body?.email);
  if (!email || email.length > 254 || !email.includes('@')) {
    return res.status(202).json({ ok: true });
  }
  return res.status(202).json({ ok: true });
});

accountRouter.post('/password-reset/confirm', async (req, res) => {
  if (!config.passwordResetEnabled || !config.userWritesEnabled || !config.passwordResetSecret) {
    return res.status(503).json({ ok: false, error: 'password_reset_not_ready' });
  }
  const passwordCheck = validatePassword(req.body?.password);
  if (!passwordCheck.ok) return res.status(400).json({ ok: false, error: passwordCheck.error });
  const reset = verifyPasswordResetToken(req.body?.token);
  if (!reset) return res.status(400).json({ ok: false, error: 'reset_token_invalid' });

  try {
    const updated = await updateUserPasswordByEmail(reset.email, passwordCheck.password);
    if (!updated) return res.status(400).json({ ok: false, error: 'reset_token_invalid' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[KOTAKAS] password reset compatibility error:', error?.message || error);
    return res.status(503).json({ ok: false, error: 'password_reset_temporarily_unavailable' });
  }
});

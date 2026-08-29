import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { createSessionToken, setSessionCookie } from './session.js';
import { createLocalUser, detectAccountWriteCompatibility, updateUserPasswordByEmail } from './account-write-adapter.js';
import { findUserByEmail } from './user-adapter.js';
import { sendPasswordResetEmail } from './email-delivery.js';
import {
  consumePasswordResetToken,
  detectPasswordResetStoreCompatibility,
  issuePasswordResetToken,
  revokePasswordResetToken,
} from './password-reset-store.js';

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

// Eski token yardımcıları test/backward compatibility için tutulur. Faz 19 gerçek akışı DB'de hashlenen tek kullanımlık token kullanır.
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

async function resetReadiness() {
  let accountReady = false;
  let tokenStoreReady = false;
  try { accountReady = (await detectAccountWriteCompatibility()).ready; } catch { accountReady = false; }
  try { tokenStoreReady = (await detectPasswordResetStoreCompatibility()).ready; } catch { tokenStoreReady = false; }
  return Boolean(
    config.passwordResetEnabled &&
    config.userWritesEnabled &&
    config.passwordResetDeliveryEnabled &&
    accountReady &&
    tokenStoreReady,
  );
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
    passwordResetReady: await resetReadiness(),
    emailDeliveryReady: config.emailDeliveryReady,
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
  if (!(await resetReadiness())) {
    return res.status(503).json({ ok: false, error: 'password_reset_not_ready' });
  }

  // Hesap var/yok bilgisini dışarı sızdırmamak için geçerli/uygunsuz e-postalarda aynı 202 cevabı kullanılır.
  const email = normalizeAccountEmail(req.body?.email);
  if (!email || email.length > 254 || !email.includes('@')) {
    return res.status(202).json({ ok: true });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(202).json({ ok: true });
    const issued = await issuePasswordResetToken(email);
    try {
      await sendPasswordResetEmail({ to: email, token: issued.token });
    } catch (error) {
      await revokePasswordResetToken(issued.token).catch(() => null);
      console.error('[KOTAKAS] password reset delivery error:', error?.message || error);
    }
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('[KOTAKAS] password reset request error:', error?.message || error);
    return res.status(202).json({ ok: true });
  }
});

accountRouter.post('/password-reset/confirm', async (req, res) => {
  if (!config.passwordResetEnabled || !config.userWritesEnabled) {
    return res.status(503).json({ ok: false, error: 'password_reset_not_ready' });
  }
  const passwordCheck = validatePassword(req.body?.password);
  if (!passwordCheck.ok) return res.status(400).json({ ok: false, error: passwordCheck.error });
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return res.status(400).json({ ok: false, error: 'reset_token_invalid' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const reset = await consumePasswordResetToken(token, client);
    if (!reset) {
      await client.query('rollback');
      return res.status(400).json({ ok: false, error: 'reset_token_invalid' });
    }
    const updated = await updateUserPasswordByEmail(reset.email, passwordCheck.password, client);
    if (!updated) {
      await client.query('rollback');
      return res.status(400).json({ ok: false, error: 'reset_token_invalid' });
    }
    await client.query('commit');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('rollback').catch(() => null);
    console.error('[KOTAKAS] password reset compatibility error:', error?.message || error);
    return res.status(503).json({ ok: false, error: 'password_reset_temporarily_unavailable' });
  } finally {
    client.release();
  }
});

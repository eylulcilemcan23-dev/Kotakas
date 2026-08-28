import jwt from 'jsonwebtoken';
import { config, isProduction } from './config.js';
import { normalizeRole } from './roles.js';

export function sanitizeSessionUser(user = {}) {
  return {
    id: user.id ?? user.sub ?? null,
    email: user.email || null,
    name: user.name || user.username || null,
    role: normalizeRole(user.role),
  };
}

export function createSessionToken(user, secret = config.jwtSecret) {
  if (!secret) throw new Error('JWT_SECRET missing');
  const safe = sanitizeSessionUser(user);
  return jwt.sign(
    { email: safe.email, name: safe.name, role: safe.role },
    secret,
    { subject: String(safe.id ?? ''), expiresIn: config.sessionTtl },
  );
}

export function verifySessionToken(token, secret = config.jwtSecret) {
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret);
    return sanitizeSessionUser({
      id: payload.sub || null,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    });
  } catch {
    return null;
  }
}

export function readSessionToken(req) {
  const cookieToken = req.cookies?.[config.sessionCookieName];
  if (cookieToken) return cookieToken;
  const auth = req.get?.('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

export function optionalSession(req, _res, next) {
  const token = readSessionToken(req);
  const user = verifySessionToken(token);
  if (user) {
    req.user = user;
    req.auth = user;
  }
  next();
}

export function setSessionCookie(res, token) {
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: config.sessionCookieMaxAgeMs,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

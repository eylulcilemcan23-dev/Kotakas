import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'kotakas_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function createSessionToken({ userId, jwtSecret }) {
  if (!jwtSecret) throw new Error('jwt_secret_missing');
  return jwt.sign(
    { sub: String(userId), typ: 'session' },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS, issuer: 'kotakas' }
  );
}

export function verifySessionToken(token, jwtSecret) {
  if (!token || !jwtSecret) return null;
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: 'kotakas' });
    if (payload?.typ !== 'session' || !payload?.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token, production) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: Boolean(production),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });
}

export function clearSessionCookie(res, production) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: Boolean(production),
    sameSite: 'lax',
    path: '/'
  });
}

export function createSessionMiddleware({ users, jwtSecret }) {
  return async function attachCurrentUser(req, _res, next) {
    try {
      req.user = null;
      const token = req.cookies?.[SESSION_COOKIE];
      const session = verifySessionToken(token, jwtSecret);
      if (!session) return next();

      const user = await users.findPublicUserById(session.userId);
      if (user?.active) req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'authentication_required' });
  next();
}

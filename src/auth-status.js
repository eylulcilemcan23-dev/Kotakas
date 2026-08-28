import { Router } from 'express';
import { config } from './config.js';
import { requireAuthenticated } from './authz.js';
import { publicUser } from './user-adapter.js';

export const authStatusRouter = Router();

authStatusRouter.get('/me', requireAuthenticated, (req, res) => {
  res.json({ ok: true, user: publicUser(req.user || req.auth) });
});

authStatusRouter.get('/auth/status', (_req, res) => {
  res.json({
    ok: true,
    sessionReady: Boolean(config.jwtSecret),
    databaseConfigured: Boolean(config.databaseUrl),
    legacyLoginEnabled: config.legacyLoginEnabled,
    googleEnabled: config.googleOAuthReady,
    sourceMode: true,
  });
});

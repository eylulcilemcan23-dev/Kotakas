import { Router } from 'express';
import { config } from './config.js';
import { publicRoleMatrix } from './roles.js';
import { LIVE_API_CONTRACT } from './legacy-contract.js';

export const apiRouter = Router();

apiRouter.get('/public-config', (_req, res) => {
  res.json({
    ok: true,
    app: 'KOTAKAS',
    environment: config.nodeEnv,
    sourceMode: true,
    googleEnabled: config.googleOAuthReady,
    legacyLoginEnabled: config.legacyLoginEnabled,
    userWritesEnabled: config.userWritesEnabled,
    registrationEnabled: config.registrationEnabled,
    passwordResetEnabled: config.passwordResetEnabled,
    passwordResetReady: Boolean(config.passwordResetEnabled && config.userWritesEnabled && config.passwordResetSecret && config.passwordResetDeliveryEnabled),
    commissionRate: config.commissionRate,
    traderDebtLimitGb: config.traderDebtLimitGb,
    marketReference: 'Kopazar.com',
  });
});

apiRouter.get('/migration-status', (_req, res) => {
  res.json({
    phase: 'source-migration',
    productionUntouched: true,
    completed: [
      'source tree',
      'healthcheck',
      'postgres adapter',
      'role/permission matrix',
      'responsive application shell',
      'footer/legal navigation',
      'live API route contract',
      'JWT session and legacy login adapter',
      'Google OAuth login adapter',
      'registration compatibility adapter',
      'password reset token core',
      'wallet/commission and escrow core',
      'CI syntax/role/session/finance/smoke tests',
    ],
    next: [
      'staging database schema confirmation',
      'registration write activation in staging',
      'password reset email delivery adapter',
      'wallet escrow SQL transaction mapping',
      'railway staging smoke tests',
    ],
  });
});

apiRouter.get('/role-matrix', (_req, res) => {
  res.json({ ok: true, roles: publicRoleMatrix() });
});

apiRouter.get('/compatibility', (_req, res) => {
  res.json({
    ok: true,
    pages: [
      '/', '/login.html', '/register.html', '/forgot-password.html', '/reset-password.html',
      '/market.html', '/buy.html', '/sell.html', '/dashboard.html', '/deals.html',
      '/notifications.html', '/profile.html', '/trader-apply.html', '/trader.html',
      '/support.html', '/admin.html', '/admin-access.html', '/kvkk.html', '/contact.html',
    ],
    liveApiContract: LIVE_API_CONTRACT,
  });
});

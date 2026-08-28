import { Router } from 'express';
import { config } from './config.js';
import { publicRoleMatrix } from './roles.js';

export const apiRouter = Router();

apiRouter.get('/public-config', (_req, res) => {
  res.json({
    ok: true,
    app: 'KOTAKAS',
    environment: config.nodeEnv,
    sourceMode: true,
    googleEnabled: config.googleOAuthReady,
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
    ],
    next: [
      'live API compatibility adapter',
      'existing auth/session migration',
      'wallet/commission data adapter',
      'google oauth',
      'staging smoke tests',
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
      '/',
      '/login.html',
      '/register.html',
      '/market.html',
      '/buy.html',
      '/sell.html',
      '/dashboard.html',
      '/deals.html',
      '/notifications.html',
      '/profile.html',
      '/trader-apply.html',
      '/trader.html',
      '/support.html',
      '/admin.html',
      '/admin-access.html',
      '/kvkk.html',
      '/contact.html',
    ],
    liveApiEndpointsObserved: [
      '/api/me',
      '/api/notifications',
      '/api/requests',
      '/api/listings',
      '/api/stats',
      '/api/transactions',
      '/api/tickets',
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/traders',
      '/api/admin/trader-applications',
      '/api/admin/listings',
      '/api/admin/wallets',
      '/api/admin/commissions',
      '/api/admin/disputes',
      '/api/admin/security-events',
      '/api/admin/settings',
      '/api/admin/market-rates',
    ],
  });
});

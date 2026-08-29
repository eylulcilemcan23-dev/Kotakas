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
    marketWritesEnabled: config.marketWritesEnabled,
    swapWritesEnabled: config.swapWritesEnabled,
    securePurchaseEnabled: Boolean(config.marketWritesEnabled && config.financeWritesEnabled && config.escrowApiEnabled),
    disputeWritesEnabled: config.disputeWritesEnabled,
    communicationWritesEnabled: config.communicationWritesEnabled,
    auditLogEnabled: config.auditLogEnabled,
    commissionRate: config.commissionRate,
    traderCommissionRate: config.traderCommissionRate,
    normalUserMonthlyListingLimit: config.normalUserMonthlyListingLimit,
    traderDebtLimitGb: config.traderDebtLimitGb,
    marketReference: 'Kopazar.com',
  });
});

apiRouter.get('/migration-status', (_req, res) => {
  res.json({
    phase: 'source-migration',
    productionUntouched: true,
    completed: [
      'source tree', 'healthcheck', 'postgres adapter', 'role/permission matrix', 'responsive application shell',
      'footer/legal navigation', 'live API route contract', 'JWT session and legacy login adapter', 'Google OAuth login adapter',
      'registration compatibility adapter', 'password reset token core', 'wallet/commission and escrow core',
      'wallet read API and dashboard', 'market listing compatibility and secure purchase core',
      'atomic escrow release/refund plus listing settlement', 'admin finance summary, escrow operations and commission dashboard',
      'dispute workflow with open-dispute payment lock', 'security audit log adapter and admin audit viewer',
      'dispute participant/admin message history with access control', 'admin unread notification inbox for dispute activity',
      'preset-only seller questions with no free-text contact exchange', 'normal-user monthly listing quota and trader-only marketplace commission',
      'admin wallet credit/debit ledger with finance permission',
      'two-listing swap workflow with same-server validation, dual receipt confirmation and admin dispute lock',
      'CI syntax/role/session/finance/market/admin/communications/smoke tests',
    ],
    next: [
      'staging database schema confirmation',
      'production-compatible listings/disputes/audit/communications/swaps migration verification',
      'market, escrow, swap, dispute, communication and audit write activation in staging',
      'password reset email delivery adapter',
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

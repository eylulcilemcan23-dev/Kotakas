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
    googleAutoRegisterEnabled: config.googleAutoRegisterEnabled,
    legacyLoginEnabled: config.legacyLoginEnabled,
    userWritesEnabled: config.userWritesEnabled,
    registrationEnabled: config.registrationEnabled,
    passwordResetEnabled: config.passwordResetEnabled,
    passwordResetReady: Boolean(config.passwordResetEnabled && config.userWritesEnabled && config.passwordResetDeliveryEnabled),
    emailDeliveryReady: config.emailDeliveryReady,
    supportWritesEnabled: config.supportWritesEnabled,
    financeWritesEnabled: config.financeWritesEnabled,
    paymentWritesEnabled: config.paymentWritesEnabled,
    withdrawalWritesEnabled: config.withdrawalWritesEnabled,
    paymentProvider: config.paymentProvider === 'disabled' ? null : config.paymentProvider,
    paymentProviderConfigured: config.paymentProviderConfigured,
    paymentCheckoutReady: config.paymentCheckoutReady,
    withdrawalMinAmount: config.withdrawalMinAmount,
    withdrawalMaxAmount: config.withdrawalMaxAmount,
    withdrawalFeeRate: config.withdrawalFeeRate,
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
      'registration compatibility adapter', 'one-time password reset token store and email delivery adapter',
      'Google verified-email account linking and optional auto-registration', 'system support ticket workflow',
      'wallet/commission and escrow core', 'wallet read API and dashboard', 'market listing compatibility and secure purchase core',
      'atomic escrow release/refund plus listing settlement', 'admin finance summary, escrow operations and commission dashboard',
      'dispute workflow with open-dispute payment lock', 'security audit log adapter and admin audit viewer',
      'dispute participant/admin message history with access control', 'admin unread notification inbox for dispute activity',
      'preset-only seller questions with no free-text contact exchange', 'normal-user monthly listing quota and trader-only marketplace commission',
      'admin wallet credit/debit ledger with finance permission',
      'two-listing swap workflow with same-server validation, dual receipt confirmation and admin dispute lock',
      'verified item catalog, compact KO search and mobile market facets',
      'provider-neutral deposit event ledger, payout token model and atomic withdrawal hold/resolve core',
      'PayTR iframe checkout and callback signature verification',
      'CI staging migration rehearsal and end-to-end finance/market/swap verification',
    ],
    next: [
      'configure real Google OAuth credentials in staging',
      'configure Resend domain/API key and verify password reset delivery in staging',
      'legal/KVKK business identity review before publication',
      'real PayTR merchant test credential verification',
      'final mobile/desktop/security release smoke and production cutover plan',
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

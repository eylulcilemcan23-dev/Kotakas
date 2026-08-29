import { Router } from 'express';
import { config } from './config.js';
import { requireAuthenticated, requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { writeAudit } from './audit-log.js';
import { createUserNotification } from './dispute-communications.js';
import {
  applyProviderPaymentEvent,
  createWithdrawalRequest,
  detectPaymentFundingCompatibility,
  listAdminWithdrawals,
  listFundingActivity,
  listPayoutAccounts,
  listUserDeposits,
  listUserWithdrawals,
  resolveWithdrawalRequest,
  verifyProviderEventSignature,
} from './payment-funding.js';
import {
  createPaytrDepositCheckout,
  paymentClientIp,
  paytrCallbackReady,
  paytrCheckoutReady,
  paytrProviderConfigured,
  processPaytrCallback,
  verifyPaytrCallback,
} from './paytr-adapter.js';

export const paymentsApiRouter = Router();

function actor(req) {
  const user = req.user || req.auth || {};
  const id = user.id == null ? '' : String(user.id);
  if (!/^\d+$/.test(id)) throw new Error('invalid user');
  return {
    id,
    role: String(user.role || 'user'),
    email: typeof user.email === 'string' ? user.email : '',
    name: typeof user.name === 'string' ? user.name : '',
  };
}

function idempotencyFrom(req, prefix) {
  const raw = req.get('x-idempotency-key') || req.body?.idempotencyKey || '';
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key || key.length > 110) throw new Error('invalid idempotency key');
  return `${prefix}:${key}`.slice(0, 128);
}

function sandboxProviderConfigured() {
  return Boolean(
    config.paymentProvider === 'sandbox' &&
    config.paymentWebhookSecret &&
    config.paymentWebhookSecret.length >= 16,
  );
}

function providerConfigured() {
  if (config.paymentProvider === 'paytr') return paytrProviderConfigured();
  return sandboxProviderConfigured();
}

async function notifyDepositPaid(result) {
  if (!result?.credited || !result?.intent?.userId) return;
  await createUserNotification({
    userId: result.intent.userId,
    kind: 'finance_deposit_paid',
    title: 'Bakiyen yüklendi',
    body: `${result.intent.amount.toFixed(2)} TL bakiyene eklendi.`,
    targetType: 'deposit',
    targetId: result.intent.id,
    dedupeKey: `deposit-paid:${result.intent.id}`,
  }).catch(() => null);
}

function fundingError(res, error) {
  const message = String(error?.message || 'payment_funding_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'funding_record_not_found' });
  if (message.includes('insufficient available')) return res.status(409).json({ ok: false, error: 'insufficient_available_balance' });
  if (message.includes('deposit amount outside limits')) return res.status(409).json({ ok: false, error: 'deposit_amount_outside_limits' });
  if (message.includes('outside limits')) return res.status(409).json({ ok: false, error: 'withdrawal_amount_outside_limits' });
  if (message.includes('idempotency key conflict')) return res.status(409).json({ ok: false, error: 'idempotency_conflict' });
  if (message.includes('already final')) return res.status(409).json({ ok: false, error: 'withdrawal_already_final' });
  if (message.includes('provider payout id required')) return res.status(400).json({ ok: false, error: 'payout_reference_required' });
  if (message.includes('resolution note required')) return res.status(400).json({ ok: false, error: 'resolution_note_required' });
  if (message.includes('withdrawal provider not ready')) return res.status(503).json({ ok: false, error: 'withdrawal_provider_not_ready' });
  if (message.includes('payment provider checkout not ready')) return res.status(503).json({ ok: false, error: 'payment_provider_checkout_not_ready' });
  if (message.includes('payment provider')) return res.status(503).json({ ok: false, error: 'payment_provider_temporarily_unavailable' });
  if (message.includes('invalid') || message.includes('mismatch')) return res.status(400).json({ ok: false, error: 'invalid_funding_request' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'funding_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] payment funding error:', message);
  return res.status(503).json({ ok: false, error: 'funding_temporarily_unavailable' });
}

paymentsApiRouter.get('/wallet/funding/status', requireAuthenticated, async (_req, res) => {
  try {
    const compatibility = await detectPaymentFundingCompatibility();
    const paytr = config.paymentProvider === 'paytr';
    return res.json({
      ok: true,
      compatibility,
      provider: config.paymentProvider === 'disabled' ? null : config.paymentProvider,
      providerConfigured: providerConfigured(),
      paymentWritesEnabled: config.paymentWritesEnabled,
      paymentCheckoutReady: paytr ? paytrCheckoutReady() : false,
      paymentMode: paytr ? (config.paytrTestMode ? 'test' : 'live') : null,
      depositMinAmount: config.depositMinAmount,
      depositMaxAmount: config.depositMaxAmount,
      withdrawalWritesEnabled: config.withdrawalWritesEnabled,
      withdrawalProviderReady: Boolean(config.withdrawalProviderReady),
      withdrawalMinAmount: config.withdrawalMinAmount,
      withdrawalMaxAmount: config.withdrawalMaxAmount,
      withdrawalFeeRate: config.withdrawalFeeRate,
      storesRawPayoutDetails: false,
      storesCardDetails: false,
    });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.get('/wallet/payout-accounts', requireAuthenticated, async (req, res) => {
  try {
    return res.json({ ok: true, accounts: await listPayoutAccounts(actor(req).id) });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.get('/wallet/deposits', requireAuthenticated, async (req, res) => {
  try {
    return res.json({ ok: true, deposits: await listUserDeposits(actor(req).id, { limit: req.query.limit }) });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.get('/wallet/withdrawals', requireAuthenticated, async (req, res) => {
  try {
    return res.json({ ok: true, withdrawals: await listUserWithdrawals(actor(req).id, { limit: req.query.limit }) });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.get('/wallet/funding/activity', requireAuthenticated, async (req, res) => {
  try {
    return res.json({ ok: true, activity: await listFundingActivity(actor(req).id, { limit: req.query.limit }) });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.post('/wallet/deposits', requireAuthenticated, async (req, res) => {
  if (config.paymentProvider !== 'paytr' || !paytrCheckoutReady()) {
    return res.status(503).json({ ok: false, error: 'payment_provider_checkout_not_ready' });
  }
  try {
    const user = actor(req);
    const intent = await createPaytrDepositCheckout({
      userId: user.id,
      amount: req.body?.amount,
      idempotencyKey: idempotencyFrom(req, 'deposit'),
      email: user.email,
      userName: req.body?.userName || user.name,
      userAddress: req.body?.userAddress,
      userPhone: req.body?.userPhone,
      userIp: paymentClientIp(req),
    });
    return res.status(201).json({ ok: true, intent, checkoutProvider: 'paytr' });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.post('/wallet/withdrawals', requireAuthenticated, async (req, res) => {
  try {
    if (config.paymentProvider === 'paytr' && !config.withdrawalProviderReady) throw new Error('withdrawal provider not ready');
    const user = actor(req);
    const withdrawal = await createWithdrawalRequest({
      userId: user.id,
      payoutAccountId: req.body?.payoutAccountId,
      amount: req.body?.amount,
      idempotencyKey: idempotencyFrom(req, 'withdrawal'),
    });
    await createUserNotification({
      userId: user.id,
      kind: 'finance_withdrawal_requested',
      title: 'Para çekme talebin alındı',
      body: `${withdrawal.amount.toFixed(2)} TL tutarındaki talebin incelemeye alındı.`,
      targetType: 'withdrawal',
      targetId: withdrawal.id,
      dedupeKey: `withdrawal-requested:${withdrawal.id}`,
    }).catch(() => null);
    return res.status(201).json({ ok: true, withdrawal });
  } catch (error) {
    return fundingError(res, error);
  }
});

// CI/sandbox için provider-bağımsız imzalı olay kanalı. PayTR canlı akışı bu endpoint'i kullanmaz.
paymentsApiRouter.post('/payments/provider-event', async (req, res) => {
  if (!sandboxProviderConfigured() || !config.paymentWritesEnabled || !config.financeWritesEnabled) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  const signature = req.get('x-kotakas-signature');
  if (!verifyProviderEventSignature(req.body, signature)) {
    return res.status(401).json({ ok: false, error: 'invalid_provider_signature' });
  }
  try {
    const result = await applyProviderPaymentEvent(req.body, { provider: 'sandbox' });
    await notifyDepositPaid(result);
    return res.json({ ok: true, status: result.intent?.status || null, credited: result.credited, duplicate: result.duplicate });
  } catch (error) {
    return fundingError(res, error);
  }
});

// PayTR Step 2 callback: session/cookie kullanmaz. Sadece PayTR HMAC doğrulaması sonrası bakiye yazılır.
paymentsApiRouter.post('/payments/paytr/callback', async (req, res) => {
  if (config.paymentProvider !== 'paytr' || !paytrCallbackReady()) {
    return res.status(503).type('text/plain').send('PAYTR callback not ready');
  }
  if (!verifyPaytrCallback(req.body)) {
    return res.status(400).type('text/plain').send('PAYTR notification failed: bad hash');
  }
  try {
    const result = await processPaytrCallback(req.body);
    await notifyDepositPaid(result);
    return res.status(200).type('text/plain').send('OK');
  } catch (error) {
    console.error('[KOTAKAS] PayTR callback processing failed:', String(error?.message || 'unknown'));
    return res.status(500).type('text/plain').send('PAYTR callback processing failed');
  }
});

paymentsApiRouter.get('/admin/finance/withdrawals', requirePermission(PERMISSIONS.FINANCE), async (req, res) => {
  try {
    const withdrawals = await listAdminWithdrawals({ status: req.query.status ?? 'requested', limit: req.query.limit });
    return res.json({ ok: true, withdrawals });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.post('/admin/finance/withdrawals/:withdrawalId/resolve', requirePermission(PERMISSIONS.FINANCE), async (req, res) => {
  try {
    const admin = actor(req);
    const withdrawal = await resolveWithdrawalRequest({
      withdrawalId: req.params.withdrawalId,
      outcome: req.body?.outcome,
      providerPayoutId: req.body?.providerPayoutId,
      resolutionNote: req.body?.resolutionNote,
    });
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: `wallet.withdrawal_${withdrawal.status}`,
      targetType: 'withdrawal',
      targetId: withdrawal.id,
      metadata: { userId: withdrawal.userId, amount: withdrawal.amount },
    }).catch(() => null);
    const paid = withdrawal.status === 'paid';
    await createUserNotification({
      userId: withdrawal.userId,
      kind: paid ? 'finance_withdrawal_paid' : 'finance_withdrawal_returned',
      title: paid ? 'Para çekme tamamlandı' : 'Para çekme bakiyene iade edildi',
      body: paid
        ? `${withdrawal.netAmount.toFixed(2)} TL para çekme işlemin tamamlandı.`
        : `${withdrawal.amount.toFixed(2)} TL tekrar kullanılabilir bakiyene aktarıldı.`,
      targetType: 'withdrawal',
      targetId: withdrawal.id,
      dedupeKey: `withdrawal-${withdrawal.status}:${withdrawal.id}`,
      createdBy: admin.id,
    }).catch(() => null);
    return res.json({ ok: true, withdrawal });
  } catch (error) {
    return fundingError(res, error);
  }
});

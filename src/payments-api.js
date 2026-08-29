import { Router } from 'express';
import { config } from './config.js';
import { requireAuthenticated, requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { writeAudit } from './audit-log.js';
import { createUserNotification } from './dispute-communications.js';
import {
  applyProviderPaymentEvent,
  createDepositIntent,
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

export const paymentsApiRouter = Router();

function actor(req) {
  const user = req.user || req.auth || {};
  const id = user.id == null ? '' : String(user.id);
  if (!/^\d+$/.test(id)) throw new Error('invalid user');
  return { id, role: String(user.role || 'user') };
}

function idempotencyFrom(req, prefix) {
  const raw = req.get('x-idempotency-key') || req.body?.idempotencyKey || '';
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key || key.length > 128) throw new Error('invalid idempotency key');
  return `${prefix}:${key}`.slice(0, 128);
}

function providerConfigured() {
  return Boolean(
    config.paymentProvider &&
    config.paymentProvider !== 'disabled' &&
    config.paymentWebhookSecret &&
    config.paymentWebhookSecret.length >= 16,
  );
}

function fundingError(res, error) {
  const message = String(error?.message || 'payment_funding_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'funding_record_not_found' });
  if (message.includes('insufficient available')) return res.status(409).json({ ok: false, error: 'insufficient_available_balance' });
  if (message.includes('outside limits')) return res.status(409).json({ ok: false, error: 'withdrawal_amount_outside_limits' });
  if (message.includes('idempotency key conflict')) return res.status(409).json({ ok: false, error: 'idempotency_conflict' });
  if (message.includes('already final')) return res.status(409).json({ ok: false, error: 'withdrawal_already_final' });
  if (message.includes('provider payout id required')) return res.status(400).json({ ok: false, error: 'payout_reference_required' });
  if (message.includes('resolution note required')) return res.status(400).json({ ok: false, error: 'resolution_note_required' });
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
    return res.json({
      ok: true,
      compatibility,
      provider: config.paymentProvider === 'disabled' ? null : config.paymentProvider,
      providerConfigured: providerConfigured(),
      paymentWritesEnabled: config.paymentWritesEnabled,
      paymentCheckoutReady: Boolean(config.paymentCheckoutReady),
      withdrawalWritesEnabled: config.withdrawalWritesEnabled,
      withdrawalMinAmount: config.withdrawalMinAmount,
      withdrawalMaxAmount: config.withdrawalMaxAmount,
      withdrawalFeeRate: config.withdrawalFeeRate,
      storesRawPayoutDetails: false,
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
  if (!config.paymentCheckoutReady) {
    return res.status(503).json({ ok: false, error: 'payment_provider_checkout_not_ready' });
  }
  try {
    const user = actor(req);
    const intent = await createDepositIntent({
      userId: user.id,
      amount: req.body?.amount,
      idempotencyKey: idempotencyFrom(req, 'deposit'),
    });
    return res.status(201).json({ ok: true, intent });
  } catch (error) {
    return fundingError(res, error);
  }
});

paymentsApiRouter.post('/wallet/withdrawals', requireAuthenticated, async (req, res) => {
  try {
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

// Provider-specific adapter ileride kendi webhook formatını bu kanonik olaya dönüştürecek.
// Bu endpoint yalnız HMAC secret + payment flag açıkken çalışır.
paymentsApiRouter.post('/payments/provider-event', async (req, res) => {
  if (!providerConfigured() || !config.paymentWritesEnabled || !config.financeWritesEnabled) {
    return res.status(503).json({ ok: false, error: 'payment_provider_not_ready' });
  }
  const signature = req.get('x-kotakas-signature');
  if (!verifyProviderEventSignature(req.body, signature)) {
    return res.status(401).json({ ok: false, error: 'invalid_provider_signature' });
  }
  try {
    const result = await applyProviderPaymentEvent(req.body);
    if (result.credited) {
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
    return res.json({ ok: true, status: result.intent?.status || null, credited: result.credited, duplicate: result.duplicate });
  } catch (error) {
    return fundingError(res, error);
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

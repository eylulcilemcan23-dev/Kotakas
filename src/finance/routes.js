import express from 'express';
import { requireUser } from '../auth/session.js';
import { requireAdminScope } from '../auth/roles.js';

function idempotencyKey(req) {
  return String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
}

function financeError(res, error) {
  const code = String(error?.message || 'finance_error');
  if (code === 'insufficient_balance') return res.status(409).json({ ok: false, error: code });
  if (code === 'idempotency_key_required') return res.status(400).json({ ok: false, error: code });
  if (['invalid_money', 'zero_adjustment_not_allowed', 'adjustment_too_large'].includes(code)) {
    return res.status(400).json({ ok: false, error: code });
  }
  throw error;
}

export function createFinanceRouter({ finance, normalRate, traderRate }) {
  const router = express.Router();

  router.get('/wallet', requireUser, async (req, res, next) => {
    try {
      const wallet = await finance.getWallet(req.user.id);
      res.json({ ok: true, wallet });
    } catch (error) {
      next(error);
    }
  });

  // Live API ile geriye uyumlu yol.
  router.get('/transactions', requireUser, async (req, res, next) => {
    try {
      const transactions = await finance.listUserTransactions(req.user.id, req.query.limit);
      res.json({ ok: true, transactions });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/wallets', requireAdminScope('finance'), async (req, res, next) => {
    try {
      const wallets = await finance.listWallets(req.query.limit);
      res.json({ ok: true, wallets });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/wallets/adjust', requireAdminScope('finance'), async (req, res, next) => {
    try {
      const key = idempotencyKey(req);
      if (!key) return res.status(400).json({ ok: false, error: 'idempotency_key_required' });

      const result = await finance.adjustBalance({
        userId: req.body?.userId,
        amount: req.body?.amountTry,
        reason: req.body?.reason,
        actorUserId: req.user.id,
        idempotencyKey: key
      });
      return res.json({ ok: true, adjustment: result });
    } catch (error) {
      try {
        return financeError(res, error);
      } catch (unhandled) {
        return next(unhandled);
      }
    }
  });

  router.get('/admin/commissions', requireAdminScope('finance'), (_req, res) => {
    res.json({
      ok: true,
      commissions: {
        normalUserPercent: Number(normalRate),
        traderPercent: Number(traderRate)
      }
    });
  });

  return router;
}

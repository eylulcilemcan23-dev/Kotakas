import { Router } from 'express';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';
import { detectFinanceWriteCompatibility } from './finance-write-adapter.js';

export const walletApiRouter = Router();

function numericUserId(value) {
  const text = value == null ? '' : String(value);
  return /^\d+$/.test(text) ? text : null;
}

export function normalizeTransactionLimit(value) {
  const parsed = Number.parseInt(String(value ?? '20'), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}

async function assertWalletSchemaReady() {
  const status = await detectFinanceWriteCompatibility();
  if (!status.ready) throw new Error(`wallet schema incompatible: ${status.blockers.join(', ')}`);
}

export async function getWalletSnapshot(userId) {
  if (!pool) throw new Error('database unavailable');
  const id = numericUserId(userId);
  if (!id) throw new Error('invalid user id');
  await assertWalletSchemaReady();

  const result = await pool.query(`
    select user_id, available_balance, held_balance, updated_at
    from wallets where user_id = $1 limit 1
  `, [id]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    userId: String(row.user_id),
    availableBalance: Number(row.available_balance),
    heldBalance: Number(row.held_balance),
    totalBalance: Number(row.available_balance) + Number(row.held_balance),
    updatedAt: row.updated_at,
  };
}

export async function getWalletTransactions(userId, limit = 20) {
  if (!pool) throw new Error('database unavailable');
  const id = numericUserId(userId);
  if (!id) throw new Error('invalid user id');
  await assertWalletSchemaReady();
  const safeLimit = normalizeTransactionLimit(limit);

  const result = await pool.query(`
    select id, order_id, kind, available_delta, held_delta, created_at
    from wallet_transactions
    where user_id = $1
    order by id desc
    limit $2
  `, [id, safeLimit]);

  return result.rows.map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    kind: row.kind,
    availableDelta: Number(row.available_delta),
    heldDelta: Number(row.held_delta),
    createdAt: row.created_at,
  }));
}

function actorId(req) {
  return numericUserId((req.user || req.auth)?.id);
}

function walletError(res, error) {
  const message = String(error?.message || 'wallet_error');
  if (message.includes('invalid user id')) return res.status(400).json({ ok: false, error: 'invalid_user' });
  if (message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'wallet_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] wallet read error:', message);
  return res.status(503).json({ ok: false, error: 'wallet_temporarily_unavailable' });
}

walletApiRouter.get('/wallet/me', requireAuthenticated, async (req, res) => {
  try {
    const wallet = await getWalletSnapshot(actorId(req));
    if (!wallet) return res.status(404).json({ ok: false, error: 'wallet_not_initialized' });
    return res.json({ ok: true, wallet });
  } catch (error) {
    return walletError(res, error);
  }
});

walletApiRouter.get('/wallet/transactions', requireAuthenticated, async (req, res) => {
  try {
    const transactions = await getWalletTransactions(actorId(req), req.query.limit);
    return res.json({ ok: true, transactions });
  } catch (error) {
    return walletError(res, error);
  }
});

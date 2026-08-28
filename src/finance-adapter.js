import { pool } from './db.js';

const TABLE_HINTS = Object.freeze({
  wallets: ['wallets', 'user_wallets', 'balances'],
  transactions: ['transactions', 'wallet_transactions', 'ledger_entries'],
  commissions: ['commissions', 'commission_entries', 'platform_commissions'],
  orders: ['orders', 'deals', 'trades', 'marketplace_orders'],
});

let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function detectFinanceSchema({ force = false } = {}) {
  if (!pool) return { ready: false, reason: 'DATABASE_URL missing', tables: {} };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;

  const result = await pool.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  const names = new Set(result.rows.map((row) => row.table_name));
  const tables = {};

  for (const [kind, hints] of Object.entries(TABLE_HINTS)) {
    tables[kind] = hints.find((name) => names.has(name)) || null;
  }

  cache = {
    ready: Boolean(tables.wallets && tables.transactions),
    tables,
    commissionReady: Boolean(tables.commissions),
    orderReady: Boolean(tables.orders),
  };
  cachedAt = Date.now();
  return cache;
}

export function calculateCommission(amount, rate) {
  const numericAmount = Number(amount);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) throw new Error('invalid amount');
  if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 1) throw new Error('invalid rate');
  const commission = Math.round(numericAmount * numericRate * 100) / 100;
  return {
    gross: numericAmount,
    commission,
    sellerNet: Math.round((numericAmount - commission) * 100) / 100,
  };
}

import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { findUserByEmail, findUserById } from './user-adapter.js';
import { writeAudit } from './audit-log.js';

export const adminWalletApiRouter = Router();

const REQUIRED = Object.freeze({
  wallets: ['user_id','available_balance','held_balance','updated_at'],
  admin_wallet_adjustments: ['id','actor_id','actor_role','user_id','amount','reason','created_at'],
});
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('invalid amount');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeReason(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 5 || text.length > 200) throw new Error('invalid reason');
  return text;
}

function actor(req) {
  const user = req.user || req.auth || {};
  const id = user.id == null ? '' : String(user.id);
  if (!/^\d+$/.test(id)) throw new Error('invalid actor');
  return { id, role: String(user.role || '') };
}

export async function detectAdminWalletCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('wallets','admin_wallet_adjustments')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name,new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const [table,columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
    for (const column of columns) if (!tables.get(table)?.has(column)) blockers.push(`missing_column:${table}.${column}`);
  }
  cache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  cachedAt = Date.now();
  return cache;
}

async function assertReady() {
  if (!config.financeWritesEnabled) throw new Error('finance writes disabled');
  if (!pool) throw new Error('database unavailable');
  const status = await detectAdminWalletCompatibility();
  if (!status.ready) throw new Error(`admin wallet schema incompatible: ${status.blockers.join(', ')}`);
}

async function resolveUser(target) {
  const value = typeof target === 'string' ? target.trim() : String(target ?? '').trim();
  if (!value) throw new Error('invalid target user');
  const user = /^\d+$/.test(value) ? await findUserById(value) : await findUserByEmail(value);
  if (!user) throw new Error('target user not found');
  return user;
}

export async function adjustWalletBalance({ actorId, actorRole, target, direction, amount, reason }) {
  await assertReady();
  const targetUser = await resolveUser(target);
  const safeAmount = money(amount);
  if (safeAmount <= 0 || safeAmount > 1_000_000) throw new Error('invalid amount');
  const mode = direction === 'debit' ? 'debit' : direction === 'credit' ? 'credit' : '';
  if (!mode) throw new Error('invalid direction');
  const signed = mode === 'credit' ? safeAmount : -safeAmount;
  const safeReasonText = safeReason(reason);
  const client = await pool.connect();
  let adjustment;
  let balance;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`admin-wallet:${targetUser.id}`]);
    await client.query(`
      insert into wallets (user_id,available_balance,held_balance,updated_at)
      values ($1,0,0,now()) on conflict (user_id) do nothing
    `, [targetUser.id]);
    const wallet = await client.query('select user_id,available_balance,held_balance from wallets where user_id=$1 for update', [targetUser.id]);
    if (!wallet.rowCount) throw new Error('wallet not found');
    const current = money(wallet.rows[0].available_balance);
    const next = money(current + signed);
    if (next < 0) throw new Error('insufficient available balance');
    await client.query('update wallets set available_balance=$2::numeric,updated_at=now() where user_id=$1', [targetUser.id,next.toFixed(2)]);
    const inserted = await client.query(`
      insert into admin_wallet_adjustments (actor_id,actor_role,user_id,amount,reason,created_at)
      values ($1,$2,$3,$4::numeric,$5,now())
      returning id,actor_id,actor_role,user_id,amount,reason,created_at
    `, [actorId,actorRole,targetUser.id,signed.toFixed(2),safeReasonText]);
    adjustment = inserted.rows[0];
    balance = next;
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await writeAudit({
    actorId,
    actorRole,
    action: mode === 'credit' ? 'wallet.admin_credit' : 'wallet.admin_debit',
    targetType: 'user_wallet',
    targetId: targetUser.id,
    metadata: { amount: signed, reason: safeReasonText, adjustmentId: String(adjustment.id) },
  }).catch(() => null);

  return {
    id: String(adjustment.id),
    userId: String(adjustment.user_id),
    userEmail: targetUser.email || null,
    amount: money(adjustment.amount),
    availableBalance: balance,
    reason: adjustment.reason,
    createdAt: adjustment.created_at,
  };
}

export async function listWalletAdjustments({ limit = 30 } = {}) {
  if (!pool) throw new Error('database unavailable');
  const status = await detectAdminWalletCompatibility();
  if (!status.ready) throw new Error(`admin wallet schema incompatible: ${status.blockers.join(', ')}`);
  const safeLimit = Math.min(100,Math.max(1,Number.parseInt(String(limit),10)||30));
  const result = await pool.query(`
    select id,actor_id,actor_role,user_id,amount,reason,created_at
    from admin_wallet_adjustments order by id desc limit $1
  `,[safeLimit]);
  return result.rows.map((row) => ({
    id:String(row.id),actorId:String(row.actor_id),actorRole:row.actor_role,userId:String(row.user_id),
    amount:money(row.amount),reason:row.reason,createdAt:row.created_at,
  }));
}

function apiError(res,error) {
  const message = String(error?.message || 'admin_wallet_error');
  if (message.includes('target user not found')) return res.status(404).json({ok:false,error:'user_not_found'});
  if (message.includes('insufficient available')) return res.status(409).json({ok:false,error:'insufficient_available_balance'});
  if (message.includes('invalid')) return res.status(400).json({ok:false,error:'invalid_wallet_adjustment'});
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) return res.status(503).json({ok:false,error:'wallet_adjustment_temporarily_unavailable'});
  console.error('[KOTAKAS] admin wallet error:',message);
  return res.status(503).json({ok:false,error:'wallet_adjustment_temporarily_unavailable'});
}

adminWalletApiRouter.get('/admin/finance/wallet-adjustments', requirePermission(PERMISSIONS.FINANCE), async (req,res) => {
  try { return res.json({ok:true,adjustments:await listWalletAdjustments({limit:req.query.limit})}); }
  catch (error) { return apiError(res,error); }
});

adminWalletApiRouter.post('/admin/finance/wallet-adjustments', requirePermission(PERMISSIONS.FINANCE), async (req,res) => {
  try {
    const a = actor(req);
    const adjustment = await adjustWalletBalance({
      actorId:a.id,actorRole:a.role,target:req.body?.target,direction:req.body?.direction,amount:req.body?.amount,reason:req.body?.reason,
    });
    return res.status(201).json({ok:true,adjustment});
  } catch (error) { return apiError(res,error); }
});

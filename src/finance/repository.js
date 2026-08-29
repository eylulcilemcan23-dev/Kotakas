import { calculateSettlement, roundMoney, validateBalanceAdjustment } from './core.js';

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function ensureWallet(client, userId) {
  await client.query(
    `insert into wallets (user_id, balance_try)
     values ($1, 0)
     on conflict (user_id) do nothing`,
    [userId]
  );
}

async function lockWallet(client, userId) {
  await ensureWallet(client, userId);
  const result = await client.query(
    `select user_id, balance_try
       from wallets
      where user_id=$1
      for update`,
    [userId]
  );
  return {
    userId: result.rows[0].user_id,
    balance: Number(result.rows[0].balance_try)
  };
}

async function ledgerExists(client, idempotencyKey) {
  const result = await client.query(
    `select id from wallet_ledger where idempotency_key=$1 limit 1`,
    [idempotencyKey]
  );
  return Boolean(result.rows[0]);
}

export function createFinanceRepository(pool) {
  return {
    async getWallet(userId) {
      return withTransaction(pool, async (client) => {
        const wallet = await lockWallet(client, userId);
        return { userId: wallet.userId, balanceTry: roundMoney(wallet.balance) };
      });
    },

    async listWallets(limit = 200) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
      const result = await pool.query(
        `select user_id, balance_try, updated_at
           from wallets
          order by updated_at desc
          limit $1`,
        [safeLimit]
      );
      return result.rows.map((row) => ({
        userId: row.user_id,
        balanceTry: Number(row.balance_try),
        updatedAt: row.updated_at
      }));
    },

    async listUserTransactions(userId, limit = 100) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
      const result = await pool.query(
        `select id, amount_try, balance_after_try, entry_type, reference, reason, actor_user_id, created_at
           from wallet_ledger
          where user_id=$1
          order by id desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map((row) => ({
        id: row.id,
        amountTry: Number(row.amount_try),
        balanceAfterTry: Number(row.balance_after_try),
        type: row.entry_type,
        reference: row.reference,
        reason: row.reason,
        actorUserId: row.actor_user_id,
        createdAt: row.created_at
      }));
    },

    async adjustBalance({ userId, amount, reason, actorUserId, idempotencyKey }) {
      const delta = validateBalanceAdjustment(amount);
      if (!idempotencyKey) throw new Error('idempotency_key_required');

      return withTransaction(pool, async (client) => {
        if (await ledgerExists(client, idempotencyKey)) {
          const existing = await client.query(
            `select user_id, amount_try, balance_after_try, entry_type, reference, reason, created_at
               from wallet_ledger
              where idempotency_key=$1 limit 1`,
            [idempotencyKey]
          );
          const row = existing.rows[0];
          return {
            duplicate: true,
            userId: row.user_id,
            amountTry: Number(row.amount_try),
            balanceAfterTry: Number(row.balance_after_try),
            type: row.entry_type,
            reason: row.reason,
            createdAt: row.created_at
          };
        }

        const wallet = await lockWallet(client, userId);
        const balanceAfter = roundMoney(wallet.balance + delta);
        if (balanceAfter < 0) throw new Error('insufficient_balance');

        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [userId, balanceAfter]
        );

        const result = await client.query(
          `insert into wallet_ledger
             (user_id, amount_try, balance_after_try, entry_type, reason, actor_user_id, idempotency_key)
           values ($1,$2,$3,'admin_adjustment',$4,$5,$6)
           returning id, created_at`,
          [userId, delta, balanceAfter, reason || null, actorUserId || null, idempotencyKey]
        );

        return {
          duplicate: false,
          id: result.rows[0].id,
          userId,
          amountTry: delta,
          balanceAfterTry: balanceAfter,
          type: 'admin_adjustment',
          reason: reason || null,
          createdAt: result.rows[0].created_at
        };
      });
    },

    async settleSale({ buyerUserId, sellerUserId, sellerRole, grossAmount, normalRate, traderRate, reference, idempotencyKey }) {
      if (!idempotencyKey) throw new Error('idempotency_key_required');
      const settlement = calculateSettlement({ sellerRole, grossAmount, normalRate, traderRate });

      return withTransaction(pool, async (client) => {
        const existing = await client.query(
          `select * from settlements where idempotency_key=$1 limit 1`,
          [idempotencyKey]
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          return {
            duplicate: true,
            id: row.id,
            grossTry: Number(row.gross_try),
            commissionTry: Number(row.commission_try),
            sellerNetTry: Number(row.seller_net_try),
            status: row.status
          };
        }

        const buyer = await lockWallet(client, buyerUserId);
        const seller = await lockWallet(client, sellerUserId);
        if (buyer.balance < settlement.gross) throw new Error('insufficient_balance');

        const buyerAfter = roundMoney(buyer.balance - settlement.gross);
        const sellerAfter = roundMoney(seller.balance + settlement.sellerNet);

        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [buyerUserId, buyerAfter]
        );
        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [sellerUserId, sellerAfter]
        );

        await client.query(
          `insert into wallet_ledger
             (user_id, amount_try, balance_after_try, entry_type, reference, idempotency_key)
           values
             ($1,$2,$3,'purchase',$4,$5),
             ($6,$7,$8,'sale_net',$4,$9)`,
          [
            buyerUserId, -settlement.gross, buyerAfter, reference || null, `${idempotencyKey}:buyer`,
            sellerUserId, settlement.sellerNet, sellerAfter, `${idempotencyKey}:seller`
          ]
        );

        await client.query(
          `insert into platform_ledger (amount_try, entry_type, reference, idempotency_key)
           values ($1,'commission',$2,$3)`,
          [settlement.commission, reference || null, `${idempotencyKey}:commission`]
        );

        const inserted = await client.query(
          `insert into settlements
             (buyer_user_id, seller_user_id, seller_role, gross_try, commission_rate, commission_try, seller_net_try, reference, idempotency_key, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
           returning id, created_at`,
          [
            buyerUserId, sellerUserId, sellerRole,
            settlement.gross, settlement.commissionRate, settlement.commission, settlement.sellerNet,
            reference || null, idempotencyKey
          ]
        );

        return {
          duplicate: false,
          id: inserted.rows[0].id,
          grossTry: settlement.gross,
          commissionRate: settlement.commissionRate,
          commissionTry: settlement.commission,
          sellerNetTry: settlement.sellerNet,
          buyerBalanceAfterTry: buyerAfter,
          sellerBalanceAfterTry: sellerAfter,
          status: 'completed',
          createdAt: inserted.rows[0].created_at
        };
      });
    }
  };
}

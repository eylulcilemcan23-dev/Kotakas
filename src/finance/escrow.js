import { calculateSettlement, roundMoney } from './core.js';

async function tx(pool, fn) {
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

async function lockWallet(client, userId) {
  await client.query(
    `insert into wallets (user_id, balance_try) values ($1,0)
     on conflict (user_id) do nothing`,
    [userId]
  );
  const result = await client.query(
    `select user_id, balance_try from wallets where user_id=$1 for update`,
    [userId]
  );
  return { userId: result.rows[0].user_id, balance: Number(result.rows[0].balance_try) };
}

function positiveMoney(value) {
  const amount = roundMoney(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_money');
  return amount;
}

export function createEscrowRepository(pool) {
  return {
    async reserve({ dealId, buyerUserId, grossAmount, idempotencyKey }) {
      const gross = positiveMoney(grossAmount);
      if (!idempotencyKey) throw new Error('idempotency_key_required');

      return tx(pool, async (client) => {
        const existing = await client.query(
          `select * from escrow_holds where deal_id=$1 limit 1 for update`,
          [dealId]
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          return {
            duplicate: true,
            dealId: row.deal_id,
            buyerUserId: row.buyer_user_id,
            grossTry: Number(row.gross_try),
            status: row.status
          };
        }

        const buyer = await lockWallet(client, buyerUserId);
        if (buyer.balance < gross) throw new Error('insufficient_balance');
        const after = roundMoney(buyer.balance - gross);

        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [buyerUserId, after]
        );
        await client.query(
          `insert into wallet_ledger
             (user_id, amount_try, balance_after_try, entry_type, reference, idempotency_key)
           values ($1,$2,$3,'escrow_hold',$4,$5)`,
          [buyerUserId, -gross, after, `deal:${dealId}`, `${idempotencyKey}:wallet`]
        );
        const inserted = await client.query(
          `insert into escrow_holds
             (deal_id, buyer_user_id, gross_try, status, idempotency_key, created_at)
           values ($1,$2,$3,'held',$4,now())
           returning *`,
          [dealId, buyerUserId, gross, idempotencyKey]
        );

        return {
          duplicate: false,
          dealId,
          buyerUserId,
          grossTry: gross,
          buyerBalanceAfterTry: after,
          status: inserted.rows[0].status
        };
      });
    },

    async release({ dealId, sellerUserId, sellerRole, normalRate, traderRate, reference, idempotencyKey }) {
      if (!idempotencyKey) throw new Error('idempotency_key_required');

      return tx(pool, async (client) => {
        const holdResult = await client.query(
          `select * from escrow_holds where deal_id=$1 limit 1 for update`,
          [dealId]
        );
        const hold = holdResult.rows[0];
        if (!hold) throw new Error('escrow_not_found');
        if (hold.status === 'released') {
          const prior = await client.query(`select * from settlements where reference=$1 limit 1`, [reference]);
          const row = prior.rows[0];
          return {
            duplicate: true,
            dealId,
            grossTry: Number(hold.gross_try),
            sellerNetTry: row ? Number(row.seller_net_try) : null,
            commissionTry: row ? Number(row.commission_try) : null,
            status: 'released'
          };
        }
        if (hold.status !== 'held') throw new Error('escrow_not_releasable');

        const settlement = calculateSettlement({
          sellerRole,
          grossAmount: Number(hold.gross_try),
          normalRate,
          traderRate
        });
        const seller = await lockWallet(client, sellerUserId);
        const sellerAfter = roundMoney(seller.balance + settlement.sellerNet);

        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [sellerUserId, sellerAfter]
        );
        await client.query(
          `insert into wallet_ledger
             (user_id, amount_try, balance_after_try, entry_type, reference, idempotency_key)
           values ($1,$2,$3,'sale_net',$4,$5)`,
          [sellerUserId, settlement.sellerNet, sellerAfter, reference, `${idempotencyKey}:seller`]
        );
        await client.query(
          `insert into platform_ledger (amount_try, entry_type, reference, idempotency_key)
           values ($1,'commission',$2,$3)`,
          [settlement.commission, reference, `${idempotencyKey}:commission`]
        );
        await client.query(
          `insert into settlements
             (buyer_user_id, seller_user_id, seller_role, gross_try, commission_rate, commission_try, seller_net_try, reference, idempotency_key, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
           on conflict (idempotency_key) do nothing`,
          [
            hold.buyer_user_id,
            sellerUserId,
            sellerRole,
            settlement.gross,
            settlement.commissionRate,
            settlement.commission,
            settlement.sellerNet,
            reference,
            idempotencyKey
          ]
        );
        await client.query(
          `update escrow_holds set status='released', released_at=now() where deal_id=$1`,
          [dealId]
        );

        return {
          duplicate: false,
          dealId,
          grossTry: settlement.gross,
          sellerNetTry: settlement.sellerNet,
          commissionTry: settlement.commission,
          sellerBalanceAfterTry: sellerAfter,
          status: 'released'
        };
      });
    },

    async refund({ dealId, buyerUserId, idempotencyKey }) {
      if (!idempotencyKey) throw new Error('idempotency_key_required');

      return tx(pool, async (client) => {
        const holdResult = await client.query(
          `select * from escrow_holds where deal_id=$1 limit 1 for update`,
          [dealId]
        );
        const hold = holdResult.rows[0];
        if (!hold) throw new Error('escrow_not_found');
        if (String(hold.buyer_user_id) !== String(buyerUserId)) throw new Error('escrow_owner_mismatch');
        if (hold.status === 'refunded') {
          return { duplicate: true, dealId, grossTry: Number(hold.gross_try), status: 'refunded' };
        }
        if (hold.status !== 'held') throw new Error('escrow_not_refundable');

        const buyer = await lockWallet(client, buyerUserId);
        const gross = Number(hold.gross_try);
        const after = roundMoney(buyer.balance + gross);

        await client.query(
          `update wallets set balance_try=$2, updated_at=now() where user_id=$1`,
          [buyerUserId, after]
        );
        await client.query(
          `insert into wallet_ledger
             (user_id, amount_try, balance_after_try, entry_type, reference, idempotency_key)
           values ($1,$2,$3,'escrow_refund',$4,$5)`,
          [buyerUserId, gross, after, `deal:${dealId}`, `${idempotencyKey}:wallet`]
        );
        await client.query(
          `update escrow_holds set status='refunded', refunded_at=now() where deal_id=$1`,
          [dealId]
        );

        return {
          duplicate: false,
          dealId,
          grossTry: gross,
          buyerBalanceAfterTry: after,
          status: 'refunded'
        };
      });
    }
  };
}

export function createTradeJournalRepository(pool) {
  return {
    async listByUser(userId, limit = 100) {
      const safeLimit = Math.min(250, Math.max(1, Number(limit) || 100));
      const result = await pool.query(
        `select id, side, asset_type as "assetType", server_code as "serverCode",
                asset_name as "assetName", quantity::float8 as quantity,
                unit_price_gb::float8 as "unitPriceGb", total_gb::float8 as "totalGb",
                note, completed_at as "completedAt", created_at as "createdAt"
           from trade_journal
          where user_id=$1
          order by completed_at desc, id desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows;
    },

    async create(userId, trade) {
      const result = await pool.query(
        `insert into trade_journal(
           user_id, side, asset_type, server_code, asset_name,
           quantity, unit_price_gb, total_gb, note, completed_at
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id, side, asset_type as "assetType", server_code as "serverCode",
                   asset_name as "assetName", quantity::float8 as quantity,
                   unit_price_gb::float8 as "unitPriceGb", total_gb::float8 as "totalGb",
                   note, completed_at as "completedAt", created_at as "createdAt"`,
        [
          userId,
          trade.side,
          trade.assetType,
          trade.serverCode,
          trade.assetName,
          trade.quantity,
          trade.unitPriceGb,
          trade.totalGb,
          trade.note,
          trade.completedAt
        ]
      );
      return result.rows[0];
    },

    async deleteOwned(id, userId) {
      const result = await pool.query(
        `delete from trade_journal where id=$1 and user_id=$2 returning id`,
        [id, userId]
      );
      return result.rows[0] || null;
    },

    async summary(userId) {
      const result = await pool.query(
        `select
           coalesce(sum(case when side='buy' then total_gb else 0 end),0)::float8 as "buySpendGb",
           coalesce(sum(case when side='sell' then total_gb else 0 end),0)::float8 as "sellRevenueGb",
           coalesce(sum(case when side='sell' then total_gb else -total_gb end),0)::float8 as "netGb",
           count(*)::int as "tradeCount"
         from trade_journal
         where user_id=$1`,
        [userId]
      );
      return result.rows[0];
    }
  };
}

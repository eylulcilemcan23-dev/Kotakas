function mapDeal(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerUserId: row.buyer_user_id,
    sellerUserId: row.seller_user_id,
    sellerRole: row.seller_role,
    serverCode: row.server_code,
    priceGb: Number(row.price_gb),
    gbTryRate: Number(row.gb_try_rate),
    grossTry: Number(row.gross_try),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createDealRepository(pool) {
  return {
    async listForUser(userId, limit = 100) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
      const result = await pool.query(
        `select * from deals
          where buyer_user_id=$1 or seller_user_id=$1
          order by id desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map(mapDeal);
    },

    async findById(id) {
      const result = await pool.query(`select * from deals where id=$1 limit 1`, [id]);
      return result.rows[0] ? mapDeal(result.rows[0]) : null;
    },

    async findOpenForBuyerListing(buyerUserId, listingId) {
      const result = await pool.query(
        `select * from deals
          where buyer_user_id=$1 and listing_id=$2
            and status in ('pending','funded','seller_delivered','disputed')
          order by id desc limit 1`,
        [buyerUserId, listingId]
      );
      return result.rows[0] ? mapDeal(result.rows[0]) : null;
    },

    async create({ listingId, buyerUserId, sellerUserId, sellerRole, serverCode, priceGb, gbTryRate, grossTry }) {
      const result = await pool.query(
        `insert into deals
           (listing_id, buyer_user_id, seller_user_id, seller_role, server_code, price_gb, gb_try_rate, gross_try, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
         returning *`,
        [listingId, buyerUserId, sellerUserId, sellerRole, serverCode, priceGb, gbTryRate, grossTry]
      );
      return mapDeal(result.rows[0]);
    },

    async transition({ id, fromStatuses, toStatus }) {
      const result = await pool.query(
        `update deals
            set status=$3, updated_at=now()
          where id=$1 and status = any($2::text[])
          returning *`,
        [id, fromStatuses, toStatus]
      );
      return result.rows[0] ? mapDeal(result.rows[0]) : null;
    }
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerUserId: row.buyer_user_id,
    sellerUserId: row.seller_user_id,
    question: row.question_text,
    answer: row.answer_text,
    status: row.status,
    createdAt: row.created_at,
    answeredAt: row.answered_at
  };
}

export function createSellerRequestRepository(pool) {
  return {
    async listForUser(userId, limit = 100) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
      const result = await pool.query(
        `select id, listing_id, buyer_user_id, seller_user_id, question_text, answer_text, status, created_at, answered_at
           from seller_requests
          where buyer_user_id=$1 or seller_user_id=$1
          order by id desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map(mapRequest);
    },

    async create({ listingId, buyerUserId, sellerUserId, question }) {
      const result = await pool.query(
        `insert into seller_requests
           (listing_id, buyer_user_id, seller_user_id, question_text, status)
         values ($1,$2,$3,$4,'pending')
         returning id, listing_id, buyer_user_id, seller_user_id, question_text, answer_text, status, created_at, answered_at`,
        [listingId, buyerUserId, sellerUserId, question]
      );
      return mapRequest(result.rows[0]);
    },

    async findById(id) {
      const result = await pool.query(
        `select id, listing_id, buyer_user_id, seller_user_id, question_text, answer_text, status, created_at, answered_at
           from seller_requests
          where id=$1 limit 1`,
        [id]
      );
      return result.rows[0] ? mapRequest(result.rows[0]) : null;
    },

    async respond({ id, sellerUserId, answer }) {
      const result = await pool.query(
        `update seller_requests
            set answer_text=$3,
                status='answered',
                answered_at=now()
          where id=$1 and seller_user_id=$2 and status='pending'
          returning id, listing_id, buyer_user_id, seller_user_id, question_text, answer_text, status, created_at, answered_at`,
        [id, sellerUserId, answer]
      );
      return result.rows[0] ? mapRequest(result.rows[0]) : null;
    }
  };
}

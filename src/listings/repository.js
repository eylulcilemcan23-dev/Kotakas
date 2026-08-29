function mapListing(row) {
  return {
    id: row.id,
    sellerUserId: row.seller_user_id,
    sellerRole: row.seller_role,
    serverCode: row.server_code,
    itemName: row.item_name,
    category: row.category,
    description: row.description,
    priceGb: Number(row.price_gb),
    status: row.status,
    publicationType: row.publication_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createListingRepository(pool) {
  return {
    async listActive({ serverCode, search, limit = 100 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
      const clauses = [`status='active'`];
      const params = [];

      if (serverCode) {
        params.push(String(serverCode).toUpperCase());
        clauses.push(`server_code=$${params.length}`);
      }

      if (search) {
        params.push(`%${String(search).trim()}%`);
        clauses.push(`(item_name ilike $${params.length} or coalesce(description,'') ilike $${params.length})`);
      }

      params.push(safeLimit);
      const result = await pool.query(
        `select * from listings
          where ${clauses.join(' and ')}
          order by created_at desc
          limit $${params.length}`,
        params
      );
      return result.rows.map(mapListing);
    },

    async listBySeller(userId, limit = 100) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
      const result = await pool.query(
        `select * from listings
          where seller_user_id=$1
          order by created_at desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map(mapListing);
    },

    async countPublishedThisMonth(userId) {
      const result = await pool.query(
        `select count(*)::int as count
           from listings
          where seller_user_id=$1
            and created_at >= date_trunc('month', now())
            and status <> 'deleted'`,
        [userId]
      );
      return Number(result.rows[0]?.count || 0);
    },

    async create({ sellerUserId, sellerRole, publicationType, serverCode, itemName, category, description, priceGb }) {
      const result = await pool.query(
        `insert into listings
           (seller_user_id, seller_role, publication_type, server_code, item_name, category, description, price_gb, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active')
         returning *`,
        [sellerUserId, sellerRole, publicationType, serverCode, itemName, category, description, priceGb]
      );
      return mapListing(result.rows[0]);
    },

    async findById(id) {
      const result = await pool.query(`select * from listings where id=$1 limit 1`, [id]);
      return mapListing(result.rows[0]);
    },

    async updateOwned(id, sellerUserId, patch) {
      const result = await pool.query(
        `update listings
            set server_code=$3,
                item_name=$4,
                category=$5,
                description=$6,
                price_gb=$7,
                updated_at=now()
          where id=$1 and seller_user_id=$2 and status='active'
          returning *`,
        [id, sellerUserId, patch.serverCode, patch.itemName, patch.category, patch.description, patch.priceGb]
      );
      return mapListing(result.rows[0]);
    },

    async closeOwned(id, sellerUserId) {
      const result = await pool.query(
        `update listings
            set status='closed', updated_at=now()
          where id=$1 and seller_user_id=$2 and status='active'
          returning *`,
        [id, sellerUserId]
      );
      return mapListing(result.rows[0]);
    },

    async moderate(id, status) {
      const result = await pool.query(
        `update listings set status=$2, updated_at=now() where id=$1 returning *`,
        [id, status]
      );
      return mapListing(result.rows[0]);
    }
  };
}

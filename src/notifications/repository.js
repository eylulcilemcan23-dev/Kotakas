function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data_json || {},
    read: Boolean(row.read_at),
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

export function createNotificationRepository(pool) {
  return {
    async listForUser(userId, limit = 100) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
      const result = await pool.query(
        `select id, type, title, body, data_json, read_at, created_at
           from notifications
          where user_id=$1
          order by id desc
          limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map(mapNotification);
    },

    async unreadCount(userId) {
      const result = await pool.query(
        `select count(*)::int as count from notifications where user_id=$1 and read_at is null`,
        [userId]
      );
      return Number(result.rows[0]?.count || 0);
    },

    async create({ userId, type, title, body, data = {} }) {
      const result = await pool.query(
        `insert into notifications (user_id, type, title, body, data_json)
         values ($1,$2,$3,$4,$5::jsonb)
         returning id, type, title, body, data_json, read_at, created_at`,
        [userId, type, title, body, JSON.stringify(data)]
      );
      return mapNotification(result.rows[0]);
    },

    async markRead(userId, id) {
      const result = await pool.query(
        `update notifications
            set read_at=coalesce(read_at, now())
          where id=$1 and user_id=$2
          returning id, type, title, body, data_json, read_at, created_at`,
        [id, userId]
      );
      return result.rows[0] ? mapNotification(result.rows[0]) : null;
    },

    async markAllRead(userId) {
      const result = await pool.query(
        `update notifications set read_at=coalesce(read_at, now()) where user_id=$1 and read_at is null`,
        [userId]
      );
      return Number(result.rowCount || 0);
    }
  };
}

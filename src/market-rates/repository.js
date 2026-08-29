const SUPPORTED_SERVERS = Object.freeze(['ZERO', 'AGARTHA', 'PANDORA', 'FELIS']);

function normalizeServer(serverCode) {
  const code = String(serverCode || '').trim().toUpperCase();
  if (!SUPPORTED_SERVERS.includes(code)) throw new Error('unsupported_server');
  return code;
}

function mapRate(row) {
  return {
    server: row.server_code,
    gbTryRate: Number(row.gb_try_rate),
    buy10mTry: row.buy_10m_try == null ? null : Number(row.buy_10m_try),
    sell10mTry: row.sell_10m_try == null ? null : Number(row.sell_10m_try),
    source: row.source || 'unknown',
    updatedAt: row.updated_at
  };
}

export { SUPPORTED_SERVERS, normalizeServer };

export function createMarketRateRepository(pool) {
  return {
    async list() {
      const result = await pool.query(
        `select server_code, gb_try_rate, buy_10m_try, sell_10m_try, source, updated_at
           from market_rates
          where server_code = any($1::text[])
          order by array_position($1::text[], server_code)`,
        [SUPPORTED_SERVERS]
      );
      return result.rows.map(mapRate);
    },

    async get(serverCode) {
      const server = normalizeServer(serverCode);
      const result = await pool.query(
        `select server_code, gb_try_rate, buy_10m_try, sell_10m_try, source, updated_at
           from market_rates
          where server_code=$1 limit 1`,
        [server]
      );
      return result.rows[0] ? mapRate(result.rows[0]) : null;
    },

    async setManual({ serverCode, gbTryRate, buy10mTry = null, sell10mTry = null }) {
      const server = normalizeServer(serverCode);
      const rate = Number(gbTryRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new Error('invalid_market_rate');

      const buy = buy10mTry == null || buy10mTry === '' ? null : Number(buy10mTry);
      const sell = sell10mTry == null || sell10mTry === '' ? null : Number(sell10mTry);
      if (buy != null && (!Number.isFinite(buy) || buy <= 0)) throw new Error('invalid_buy_rate');
      if (sell != null && (!Number.isFinite(sell) || sell <= 0)) throw new Error('invalid_sell_rate');

      const result = await pool.query(
        `insert into market_rates (server_code, gb_try_rate, buy_10m_try, sell_10m_try, source, updated_at)
         values ($1,$2,$3,$4,'admin_manual',now())
         on conflict (server_code) do update
           set gb_try_rate=excluded.gb_try_rate,
               buy_10m_try=excluded.buy_10m_try,
               sell_10m_try=excluded.sell_10m_try,
               source='admin_manual',
               updated_at=now()
         returning server_code, gb_try_rate, buy_10m_try, sell_10m_try, source, updated_at`,
        [server, rate, buy, sell]
      );
      return mapRate(result.rows[0]);
    }
  };
}

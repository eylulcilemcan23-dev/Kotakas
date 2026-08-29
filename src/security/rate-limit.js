export function createIpRateLimit({ windowMs = 60_000, max = 10 } = {}) {
  const buckets = new Map();

  function cleanup(now) {
    if (buckets.size < 5000) return;
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ ok: false, error: 'too_many_requests', retryAfter });
    }

    next();
  };
}

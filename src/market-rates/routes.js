import express from 'express';
import { requireAdminScope } from '../auth/roles.js';

function rateError(res, error) {
  const code = String(error?.message || 'market_rate_error');
  if (['unsupported_server', 'invalid_market_rate', 'invalid_buy_rate', 'invalid_sell_rate'].includes(code)) {
    return res.status(400).json({ ok: false, error: code });
  }
  throw error;
}

export function createMarketRateRouter({ marketRates }) {
  const router = express.Router();

  router.get('/market-rates', async (_req, res, next) => {
    try {
      const rates = await marketRates.list();
      res.json({ ok: true, rates });
    } catch (error) {
      next(error);
    }
  });

  router.get('/market-rates/:server', async (req, res, next) => {
    try {
      const rate = await marketRates.get(req.params.server);
      if (!rate) return res.status(404).json({ ok: false, error: 'market_rate_not_found' });
      res.json({ ok: true, rate });
    } catch (error) {
      try {
        return rateError(res, error);
      } catch (unhandled) {
        return next(unhandled);
      }
    }
  });

  router.get('/admin/market-rates', requireAdminScope('finance'), async (_req, res, next) => {
    try {
      const rates = await marketRates.list();
      res.json({ ok: true, rates });
    } catch (error) {
      next(error);
    }
  });

  router.put('/admin/market-rates/:server', requireAdminScope('finance'), async (req, res, next) => {
    try {
      const rate = await marketRates.setManual({
        serverCode: req.params.server,
        gbTryRate: req.body?.gbTryRate,
        buy10mTry: req.body?.buy10mTry,
        sell10mTry: req.body?.sell10mTry
      });
      res.json({ ok: true, rate });
    } catch (error) {
      try {
        return rateError(res, error);
      } catch (unhandled) {
        return next(unhandled);
      }
    }
  });

  return router;
}

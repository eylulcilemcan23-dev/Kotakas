import express from 'express';
import { requireUser } from '../auth/session.js';
import { validateCompletedTradeInput } from './core.js';

export function createTradeJournalRouter({ tradeJournal }) {
  const router = express.Router();

  router.get('/trade-journal', requireUser, async (req, res, next) => {
    try {
      const rows = await tradeJournal.listByUser(req.user.id, req.query.limit);
      res.json({ ok: true, trades: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get('/trade-journal/summary', requireUser, async (req, res, next) => {
    try {
      const summary = await tradeJournal.summary(req.user.id);
      res.json({ ok: true, summary });
    } catch (error) {
      next(error);
    }
  });

  router.post('/trade-journal', requireUser, async (req, res, next) => {
    try {
      const validation = validateCompletedTradeInput(req.body || {});
      if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error });

      const trade = await tradeJournal.create(req.user.id, validation.value);
      return res.status(201).json({ ok: true, trade });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/trade-journal/:id', requireUser, async (req, res, next) => {
    try {
      const deleted = await tradeJournal.deleteOwned(req.params.id, req.user.id);
      if (!deleted) return res.status(404).json({ ok: false, error: 'trade_not_found' });
      return res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

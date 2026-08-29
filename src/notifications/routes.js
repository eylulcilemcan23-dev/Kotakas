import express from 'express';
import { requireUser } from '../auth/session.js';

export function createNotificationRouter({ notifications }) {
  const router = express.Router();

  router.get('/notifications', requireUser, async (req, res, next) => {
    try {
      const [items, unreadCount] = await Promise.all([
        notifications.listForUser(req.user.id, req.query.limit),
        notifications.unreadCount(req.user.id)
      ]);
      res.json({ ok: true, notifications: items, unreadCount });
    } catch (error) {
      next(error);
    }
  });

  router.post('/notifications/:id/read', requireUser, async (req, res, next) => {
    try {
      const notification = await notifications.markRead(req.user.id, req.params.id);
      if (!notification) return res.status(404).json({ ok: false, error: 'notification_not_found' });
      res.json({ ok: true, notification });
    } catch (error) {
      next(error);
    }
  });

  router.post('/notifications/read-all', requireUser, async (req, res, next) => {
    try {
      const updated = await notifications.markAllRead(req.user.id);
      res.json({ ok: true, updated });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

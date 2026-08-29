import express from 'express';
import { requireUser } from '../auth/session.js';
import { requireAdminScope } from '../auth/roles.js';
import { getPublicationDecision, validateListingInput } from './core.js';

const ALLOWED_MODERATION_STATUSES = new Set(['active', 'paused', 'closed', 'removed']);

export function createListingRouter({ listings }) {
  const router = express.Router();

  router.get('/listings', async (req, res, next) => {
    try {
      const rows = await listings.listActive({
        serverCode: req.query.server,
        search: req.query.search,
        limit: req.query.limit
      });
      res.json({ ok: true, listings: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get('/listings/mine', requireUser, async (req, res, next) => {
    try {
      const rows = await listings.listBySeller(req.user.id, req.query.limit);
      res.json({ ok: true, listings: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post('/listings', requireUser, async (req, res, next) => {
    try {
      const validation = validateListingInput(req.body || {});
      if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error, message: validation.message });

      const publishedThisMonth = await listings.countPublishedThisMonth(req.user.id);
      const publication = getPublicationDecision({ role: req.user.role, publishedThisMonth });

      if (!publication.allowed) {
        const status = publication.requiresPayment ? 402 : 403;
        return res.status(status).json({
          ok: false,
          error: publication.error,
          requiresPayment: publication.requiresPayment,
          freeRemaining: publication.freeRemaining
        });
      }

      const listing = await listings.create({
        sellerUserId: req.user.id,
        sellerRole: req.user.role,
        publicationType: publication.publicationType,
        ...validation.value
      });

      return res.status(201).json({
        ok: true,
        listing,
        freeRemaining: publication.freeRemaining
      });
    } catch (error) {
      next(error);
    }
  });

  async function updateOwned(req, res, next) {
    try {
      const validation = validateListingInput(req.body || {});
      if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error, message: validation.message });

      const listing = await listings.updateOwned(req.params.id, req.user.id, validation.value);
      if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found_or_not_owned' });
      return res.json({ ok: true, listing });
    } catch (error) {
      next(error);
    }
  }

  router.put('/listings/:id', requireUser, updateOwned);
  router.patch('/listings/:id', requireUser, updateOwned);

  router.delete('/listings/:id', requireUser, async (req, res, next) => {
    try {
      const listing = await listings.closeOwned(req.params.id, req.user.id);
      if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found_or_not_owned' });
      return res.json({ ok: true, listing });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/listings', requireAdminScope('listings'), async (req, res, next) => {
    try {
      const rows = await listings.listAll(req.query.limit);
      res.json({ ok: true, listings: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/listings/:id/status', requireAdminScope('listings'), async (req, res, next) => {
    try {
      const status = String(req.body?.status || '').toLowerCase();
      if (!ALLOWED_MODERATION_STATUSES.has(status)) {
        return res.status(400).json({ ok: false, error: 'invalid_listing_status' });
      }

      const listing = await listings.moderate(req.params.id, status);
      if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found' });
      return res.json({ ok: true, listing });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

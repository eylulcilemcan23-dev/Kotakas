import express from 'express';
import { requireUser } from '../auth/session.js';
import { roundMoney } from '../finance/core.js';

function dealError(res, error) {
  const code = String(error?.message || 'deal_error');
  if (code === 'insufficient_balance') return res.status(409).json({ ok: false, error: code });
  if (['invalid_money', 'escrow_not_found', 'escrow_not_releasable', 'escrow_not_refundable'].includes(code)) {
    return res.status(409).json({ ok: false, error: code });
  }
  throw error;
}

export function createDealRouter({ deals, listings, marketRates, escrow, notifications, normalRate, traderRate }) {
  const router = express.Router();

  router.get('/deals', requireUser, async (req, res, next) => {
    try {
      const items = await deals.listForUser(req.user.id, req.query.limit);
      res.json({ ok: true, deals: items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deals', requireUser, async (req, res, next) => {
    try {
      let listing;
      try {
        listing = await listings.findById(req.body?.listingId);
      } catch {
        listing = null;
      }
      if (!listing || listing.status !== 'active') {
        return res.status(404).json({ ok: false, error: 'listing_not_found' });
      }
      if (String(listing.sellerUserId) === String(req.user.id)) {
        return res.status(400).json({ ok: false, error: 'cannot_buy_own_listing' });
      }

      const existing = await deals.findOpenForBuyerListing(req.user.id, listing.id);
      if (existing) return res.status(409).json({ ok: false, error: 'open_deal_exists', deal: existing });

      const rate = await marketRates.get(listing.serverCode);
      if (!rate) return res.status(503).json({ ok: false, error: 'market_rate_unavailable' });

      const grossTry = roundMoney(Number(listing.priceGb) * Number(rate.gbTryRate));
      if (!Number.isFinite(grossTry) || grossTry <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_deal_amount' });
      }

      const deal = await deals.create({
        listingId: listing.id,
        buyerUserId: req.user.id,
        sellerUserId: listing.sellerUserId,
        sellerRole: listing.sellerRole,
        serverCode: listing.serverCode,
        priceGb: listing.priceGb,
        gbTryRate: rate.gbTryRate,
        grossTry
      });

      await notifications.create({
        userId: listing.sellerUserId,
        type: 'deal_created',
        title: 'İlanınıza satın alma talebi geldi',
        body: `${listing.itemName} için ${listing.priceGb} GB satın alma talebi.`,
        data: { dealId: deal.id, listingId: listing.id }
      });

      res.status(201).json({ ok: true, deal });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deals/:id/accept', requireUser, async (req, res, next) => {
    let deal;
    try {
      deal = await deals.findById(req.params.id);
      if (!deal) return res.status(404).json({ ok: false, error: 'deal_not_found' });
      if (String(deal.sellerUserId) !== String(req.user.id)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const funding = await deals.transition({ id: deal.id, fromStatuses: ['pending'], toStatus: 'funding' });
      if (!funding) return res.status(409).json({ ok: false, error: 'deal_not_pending' });

      try {
        await escrow.reserve({
          dealId: deal.id,
          buyerUserId: deal.buyerUserId,
          grossAmount: deal.grossTry,
          idempotencyKey: `deal:${deal.id}:hold`
        });
      } catch (error) {
        await deals.transition({ id: deal.id, fromStatuses: ['funding'], toStatus: 'pending' }).catch(() => {});
        try {
          return dealError(res, error);
        } catch (unhandled) {
          return next(unhandled);
        }
      }

      const funded = await deals.transition({ id: deal.id, fromStatuses: ['funding'], toStatus: 'funded' });
      await notifications.create({
        userId: deal.buyerUserId,
        type: 'deal_funded',
        title: 'Satıcı talebinizi kabul etti',
        body: 'Ödeme KOTAKAS emanet bakiyesinde güvenceye alındı.',
        data: { dealId: deal.id }
      });
      return res.json({ ok: true, deal: funded });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/deals/:id/delivered', requireUser, async (req, res, next) => {
    try {
      const deal = await deals.findById(req.params.id);
      if (!deal) return res.status(404).json({ ok: false, error: 'deal_not_found' });
      if (String(deal.sellerUserId) !== String(req.user.id)) return res.status(403).json({ ok: false, error: 'forbidden' });

      const updated = await deals.transition({ id: deal.id, fromStatuses: ['funded'], toStatus: 'seller_delivered' });
      if (!updated) return res.status(409).json({ ok: false, error: 'deal_not_funded' });

      await notifications.create({
        userId: deal.buyerUserId,
        type: 'seller_delivered',
        title: 'Satıcı teslimatı işaretledi',
        body: 'Ürünü oyun içinde teslim aldıysanız işlemi tamamlayın. Almadıysanız onay vermeyin.',
        data: { dealId: deal.id }
      });
      res.json({ ok: true, deal: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deals/:id/complete', requireUser, async (req, res, next) => {
    try {
      const deal = await deals.findById(req.params.id);
      if (!deal) return res.status(404).json({ ok: false, error: 'deal_not_found' });
      if (String(deal.buyerUserId) !== String(req.user.id)) return res.status(403).json({ ok: false, error: 'forbidden' });

      const releasing = await deals.transition({ id: deal.id, fromStatuses: ['seller_delivered'], toStatus: 'releasing' });
      if (!releasing) return res.status(409).json({ ok: false, error: 'deal_not_ready_to_complete' });

      let settlement;
      try {
        settlement = await escrow.release({
          dealId: deal.id,
          sellerUserId: deal.sellerUserId,
          sellerRole: deal.sellerRole,
          normalRate,
          traderRate,
          reference: `deal:${deal.id}`,
          idempotencyKey: `deal:${deal.id}:release`
        });
      } catch (error) {
        await deals.transition({ id: deal.id, fromStatuses: ['releasing'], toStatus: 'seller_delivered' }).catch(() => {});
        try {
          return dealError(res, error);
        } catch (unhandled) {
          return next(unhandled);
        }
      }

      const completed = await deals.transition({ id: deal.id, fromStatuses: ['releasing'], toStatus: 'completed' });
      await listings.closeOwned(deal.listingId, deal.sellerUserId).catch(() => {});
      await notifications.create({
        userId: deal.sellerUserId,
        type: 'deal_completed',
        title: 'Satış tamamlandı',
        body: 'Alıcı teslimatı onayladı. Net satış tutarı bakiyenize aktarıldı.',
        data: { dealId: deal.id, settlement }
      });
      res.json({ ok: true, deal: completed, settlement });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deals/:id/cancel', requireUser, async (req, res, next) => {
    try {
      const deal = await deals.findById(req.params.id);
      if (!deal) return res.status(404).json({ ok: false, error: 'deal_not_found' });
      const actorIsParty = [deal.buyerUserId, deal.sellerUserId].some((id) => String(id) === String(req.user.id));
      if (!actorIsParty) return res.status(403).json({ ok: false, error: 'forbidden' });

      if (deal.status === 'pending') {
        const cancelled = await deals.transition({ id: deal.id, fromStatuses: ['pending'], toStatus: 'cancelled' });
        return res.json({ ok: true, deal: cancelled });
      }

      if (deal.status === 'funded') {
        const refunding = await deals.transition({ id: deal.id, fromStatuses: ['funded'], toStatus: 'refunding' });
        if (!refunding) return res.status(409).json({ ok: false, error: 'deal_not_cancellable' });

        let refund;
        try {
          refund = await escrow.refund({
            dealId: deal.id,
            buyerUserId: deal.buyerUserId,
            idempotencyKey: `deal:${deal.id}:refund`
          });
        } catch (error) {
          await deals.transition({ id: deal.id, fromStatuses: ['refunding'], toStatus: 'funded' }).catch(() => {});
          try {
            return dealError(res, error);
          } catch (unhandled) {
            return next(unhandled);
          }
        }

        const cancelled = await deals.transition({ id: deal.id, fromStatuses: ['refunding'], toStatus: 'cancelled' });
        return res.json({ ok: true, deal: cancelled, refund });
      }

      return res.status(409).json({ ok: false, error: 'deal_not_cancellable', disputeAvailable: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deals/:id/dispute', requireUser, async (req, res, next) => {
    try {
      const deal = await deals.findById(req.params.id);
      if (!deal) return res.status(404).json({ ok: false, error: 'deal_not_found' });
      const actorIsParty = [deal.buyerUserId, deal.sellerUserId].some((id) => String(id) === String(req.user.id));
      if (!actorIsParty) return res.status(403).json({ ok: false, error: 'forbidden' });

      const disputed = await deals.transition({
        id: deal.id,
        fromStatuses: ['funded', 'seller_delivered'],
        toStatus: 'disputed'
      });
      if (!disputed) return res.status(409).json({ ok: false, error: 'deal_not_disputable' });

      res.json({
        ok: true,
        deal: disputed,
        message: 'Emanet bakiye kilitli kaldı. Admin incelemesi gereklidir.'
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

import express from 'express';
import { requireUser } from '../auth/session.js';
import {
  READY_SELLER_QUESTIONS,
  READY_SELLER_ANSWERS,
  canSendSellerQuestion,
  canSendSellerAnswer
} from '../domain/marketplace-policy.js';

export function createSellerRequestRouter({ requests, listings, notifications }) {
  const router = express.Router();

  router.get('/requests/options', (_req, res) => {
    res.json({
      ok: true,
      freeFormChatEnabled: false,
      questions: READY_SELLER_QUESTIONS,
      answers: READY_SELLER_ANSWERS
    });
  });

  router.get('/requests', requireUser, async (req, res, next) => {
    try {
      const items = await requests.listForUser(req.user.id, req.query.limit);
      res.json({ ok: true, requests: items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests', requireUser, async (req, res, next) => {
    try {
      const question = String(req.body?.message || req.body?.question || '').trim();
      const policy = canSendSellerQuestion(question);
      if (!policy.ok) return res.status(400).json(policy);

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
        return res.status(400).json({ ok: false, error: 'cannot_question_own_listing' });
      }

      const request = await requests.create({
        listingId: listing.id,
        buyerUserId: req.user.id,
        sellerUserId: listing.sellerUserId,
        question
      });

      await notifications.create({
        userId: listing.sellerUserId,
        type: 'seller_question',
        title: 'İlanınıza yeni soru geldi',
        body: question,
        data: { requestId: request.id, listingId: listing.id }
      });

      res.status(201).json({ ok: true, request });
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:id/respond', requireUser, async (req, res, next) => {
    try {
      const answer = String(req.body?.message || req.body?.answer || '').trim();
      const policy = canSendSellerAnswer(answer);
      if (!policy.ok) return res.status(400).json(policy);

      const existing = await requests.findById(req.params.id);
      if (!existing) return res.status(404).json({ ok: false, error: 'request_not_found' });
      if (String(existing.sellerUserId) !== String(req.user.id)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      if (existing.status !== 'pending') {
        return res.status(409).json({ ok: false, error: 'request_already_answered' });
      }

      const request = await requests.respond({
        id: existing.id,
        sellerUserId: req.user.id,
        answer
      });

      await notifications.create({
        userId: existing.buyerUserId,
        type: 'seller_answer',
        title: 'Satıcı sorunuza cevap verdi',
        body: answer,
        data: { requestId: request.id, listingId: request.listingId }
      });

      res.json({ ok: true, request });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

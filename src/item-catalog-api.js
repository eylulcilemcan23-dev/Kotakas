import { Router } from 'express';
import { config } from './config.js';
import { requireAuthenticated } from './authz.js';
import { createCatalogListing } from './catalog-marketplace.js';
import {
  detectItemCatalogCompatibility,
  getCatalogItem,
  listCatalogCategories,
  listCatalogFacets,
  listCatalogMarketListings,
  searchItemCatalog,
} from './item-catalog-core.js';

export const itemCatalogRouter = Router();

function actor(req) {
  const user = req.user || req.auth || {};
  const value = user.id;
  const id = value == null ? '' : String(value);
  return { id: /^\d+$/.test(id) ? id : null, role: String(user.role || 'user') };
}

function errorResponse(res, error) {
  const message = String(error?.message || 'item_catalog_error');
  if (message.includes('catalog item not found')) return res.status(404).json({ ok: false, error: 'catalog_item_not_found' });
  if (message.includes('monthly listing limit')) return res.status(409).json({ ok: false, error: 'monthly_listing_limit_reached' });
  if (message.includes('variant unavailable')) return res.status(409).json({ ok: false, error: 'catalog_variant_unavailable' });
  if (message.includes('external contact info')) return res.status(400).json({ ok: false, error: 'external_contact_not_allowed' });
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_catalog_request' });
  if (message.includes('disabled')) return res.status(503).json({ ok: false, error: 'catalog_writes_disabled' });
  if (message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'item_catalog_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] item catalog error:', message);
  return res.status(503).json({ ok: false, error: 'item_catalog_temporarily_unavailable' });
}

itemCatalogRouter.get('/item-catalog/categories', async (_req, res) => {
  try {
    const categories = await listCatalogCategories();
    return res.json({ ok: true, categories });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.get('/item-catalog/facets', async (_req, res) => {
  try {
    const facets = await listCatalogFacets();
    return res.json({ ok: true, ...facets });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.get('/item-catalog', async (req, res) => {
  try {
    const items = await searchItemCatalog({
      q: req.query.q,
      category: req.query.category,
      subcategory: req.query.subcategory,
      classInfo: req.query.class,
      limit: req.query.limit,
    });
    return res.json({ ok: true, items });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.get('/item-catalog/:itemId', async (req, res) => {
  try {
    const item = await getCatalogItem(req.params.itemId);
    return res.json({ ok: true, item });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.get('/market/catalog-listings', async (req, res) => {
  try {
    const listings = await listCatalogMarketListings({
      q: req.query.q,
      category: req.query.category,
      subcategory: req.query.subcategory,
      classInfo: req.query.class,
      server: req.query.server,
      sort: req.query.sort,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ ok: true, listings });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.post('/market/catalog-listings', requireAuthenticated, async (req, res) => {
  if (!config.marketWritesEnabled) return res.status(503).json({ ok: false, error: 'market_writes_disabled' });
  const user = actor(req);
  if (!user.id) return res.status(400).json({ ok: false, error: 'invalid_user' });
  try {
    const listing = await createCatalogListing({
      sellerId: user.id,
      sellerRole: user.role,
      itemId: req.body?.itemId,
      server: req.body?.server,
      enhancement: req.body?.enhancement,
      reverse: req.body?.reverse,
      deliveryWindow: req.body?.deliveryWindow,
      description: req.body?.description,
      price: req.body?.price,
    });
    return res.status(201).json({ ok: true, listing });
  } catch (error) {
    return errorResponse(res, error);
  }
});

itemCatalogRouter.get('/admin/item-catalog-compatibility', requireAuthenticated, async (req, res) => {
  const role = actor(req).role;
  if (!['admin_owner', 'admin_full'].includes(role)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    const status = await detectItemCatalogCompatibility({ force: true });
    return res.json({ ok: true, ...status, marketWritesEnabled: config.marketWritesEnabled });
  } catch (error) {
    return errorResponse(res, error);
  }
});

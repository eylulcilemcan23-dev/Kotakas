import { config } from './config.js';
import { pool } from './db.js';
import { assertListingAllowance, assertListingContentSafe } from './marketplace-policy.js';
import { detectItemCatalogCompatibility, getCatalogItemRecord, resolveCatalogAttributes } from './item-catalog-core.js';

const LISTING_COLUMNS = [
  'id', 'seller_id', 'title', 'server', 'description', 'price', 'status', 'order_id', 'created_at', 'updated_at',
];

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function text(value, max, label) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (!out || out.length > max) throw new Error(`invalid ${label}`);
  return out;
}

function optionalText(value, max, label = 'text') {
  const out = typeof value === 'string' ? value.trim() : '';
  if (out.length > max) throw new Error(`invalid ${label}`);
  return out || null;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('invalid price');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function enhancementValue(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 21) throw new Error('invalid enhancement');
  return parsed;
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function listingView(row, item) {
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: row.title,
    server: row.server,
    description: row.description || '',
    price: Number(row.price),
    status: row.status,
    orderId: row.order_id == null ? null : String(row.order_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item,
  };
}

export async function createCatalogListing({ sellerId, sellerRole, itemId, server, enhancement, reverse = false, deliveryWindow = '', description = '', price }) {
  if (!config.marketWritesEnabled) throw new Error('market writes disabled');
  if (!pool) throw new Error('database unavailable');
  const compatibility = await detectItemCatalogCompatibility();
  if (!compatibility.ready) throw new Error(`item catalog listing schema incompatible: ${compatibility.blockers.join(', ')}`);

  const seller = numericId(sellerId, 'seller id');
  const catalogId = numericId(itemId, 'catalog item id');
  const safeServer = text(server, 32, 'server').toUpperCase();
  const safeEnhancement = enhancementValue(enhancement);
  const safeReverse = bool(reverse);
  const safeDeliveryWindow = optionalText(deliveryWindow, 80, 'delivery window');
  const safeDescription = optionalText(description, 2000, 'description');
  const safePrice = money(price);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`listing-quota:${seller}:${new Date().toISOString().slice(0, 7)}`]);
    await assertListingAllowance(client, seller, sellerRole);

    const item = await getCatalogItemRecord(catalogId, client);
    const resolvedAttributes = resolveCatalogAttributes(item.base_attributes, item.variants, safeEnhancement, safeReverse);
    const title = `${item.canonical_name} +${safeEnhancement}`;
    assertListingContentSafe({ title, description: safeDescription || '' });

    const result = await client.query(`
      insert into listings (seller_id,title,server,description,price,status,order_id,created_at,updated_at)
      values ($1,$2,$3,$4,$5::numeric,'active',null,now(),now())
      returning ${LISTING_COLUMNS.join(', ')}
    `, [seller, title, safeServer, safeDescription, safePrice.toFixed(2)]);
    const listing = result.rows[0];

    await client.query(`
      insert into listing_item_metadata (
        listing_id,item_id,enhancement,reverse,delivery_window,attributes,created_at,updated_at
      ) values ($1,$2,$3,$4,$5,$6::jsonb,now(),now())
      on conflict (listing_id) do update set
        item_id=excluded.item_id,
        enhancement=excluded.enhancement,
        reverse=excluded.reverse,
        delivery_window=excluded.delivery_window,
        attributes=excluded.attributes,
        updated_at=now()
    `, [listing.id, item.id, safeEnhancement, safeReverse, safeDeliveryWindow, JSON.stringify(resolvedAttributes)]);

    await client.query('commit');
    return listingView(listing, {
      id: String(item.id),
      canonicalName: item.canonical_name,
      category: item.category || null,
      subcategory: item.subcategory || null,
      enhancement: safeEnhancement,
      reverse: safeReverse,
      attributes: resolvedAttributes,
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

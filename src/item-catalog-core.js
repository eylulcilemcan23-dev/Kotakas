import { pool } from './db.js';
import { catalogSearchRankExpression, parseCatalogSearchQuery } from './item-catalog-search.js';

const REQUIRED = Object.freeze({
  item_catalog: [
    'id', 'canonical_name', 'slug', 'image_url', 'class_info', 'base_attributes',
    'category', 'subcategory', 'keywords', 'variants', 'source_name', 'source_ref', 'source_license', 'active',
  ],
  listing_item_metadata: ['listing_id', 'item_id', 'enhancement', 'reverse', 'delivery_window', 'attributes'],
  listings: ['id', 'seller_id', 'title', 'server', 'description', 'price', 'status', 'created_at', 'updated_at'],
});

let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function safeLimit(value, fallback = 20, max = 100) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Math.min(max, Math.max(1, Number.isFinite(parsed) ? parsed : fallback));
}

function safeOffset(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}

function text(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeImageUrl(value) {
  const raw = text(value, 500);
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function levelKeys(variants, branch) {
  const group = objectValue(objectValue(variants)[branch]);
  return Object.keys(group)
    .filter((key) => /^\d{1,2}$/.test(key))
    .map(Number)
    .filter((value) => value >= 0 && value <= 21)
    .sort((a, b) => a - b);
}

function catalogView(row, matchedEnhancement = null) {
  const variants = objectValue(row.variants);
  return {
    id: String(row.id),
    canonicalName: row.canonical_name,
    slug: row.slug,
    imageUrl: safeImageUrl(row.image_url),
    classInfo: row.class_info || null,
    category: row.category || null,
    subcategory: row.subcategory || null,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    baseAttributes: objectValue(row.base_attributes),
    normalLevels: levelKeys(variants, 'normal'),
    reverseLevels: levelKeys(variants, 'reverse'),
    matchedEnhancement,
    source: {
      name: row.source_name || null,
      ref: row.source_ref || null,
      license: row.source_license || null,
    },
  };
}

export async function detectItemCatalogCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, catalogReady: false, listingMetadataReady: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;

  const result = await pool.query(`
    select table_name,column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = any($1::text[])
  `, [Object.keys(REQUIRED)]);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const blockers = [];
  const readiness = {};
  for (const [table, columns] of Object.entries(REQUIRED)) {
    const missing = columns.filter((column) => !tables.get(table)?.has(column));
    readiness[table] = missing.length === 0;
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
    for (const column of missing) blockers.push(`missing_column:${table}.${column}`);
  }

  compatibilityCache = {
    ready: Boolean(readiness.item_catalog && readiness.listing_item_metadata && readiness.listings),
    catalogReady: Boolean(readiness.item_catalog),
    listingMetadataReady: Boolean(readiness.listing_item_metadata),
    listingsReady: Boolean(readiness.listings),
    blockers: [...new Set(blockers)],
  };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertCatalogReady({ requireListingMetadata = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  const status = await detectItemCatalogCompatibility();
  if (!status.catalogReady) throw new Error(`item catalog schema incompatible: ${status.blockers.join(', ')}`);
  if (requireListingMetadata && !status.ready) throw new Error(`item catalog listing schema incompatible: ${status.blockers.join(', ')}`);
  return status;
}

export function resolveCatalogAttributes(baseAttributes, variants, enhancement, reverse = false) {
  const level = Number.parseInt(String(enhancement), 10);
  if (!Number.isFinite(level) || level < 0 || level > 21) throw new Error('invalid enhancement');
  const branch = reverse ? 'reverse' : 'normal';
  const group = objectValue(objectValue(variants)[branch]);
  const variant = objectValue(group[String(level)]);
  if (!Object.keys(variant).length) throw new Error('catalog variant unavailable');
  return { ...objectValue(baseAttributes), ...variant };
}

export async function getCatalogItemRecord(itemId, queryable = pool) {
  await assertCatalogReady();
  const id = numericId(itemId, 'catalog item id');
  const result = await queryable.query(`
    select id,canonical_name,slug,image_url,class_info,base_attributes,category,subcategory,keywords,
           variants,source_name,source_ref,source_license,active
    from item_catalog where id = $1 limit 1
  `, [id]);
  if (!result.rowCount || !result.rows[0].active) throw new Error('catalog item not found');
  return result.rows[0];
}

export async function getCatalogItem(itemId) {
  return catalogView(await getCatalogItemRecord(itemId));
}

export async function searchItemCatalog({ q = '', category = '', subcategory = '', classInfo = '', limit = 20 } = {}) {
  await assertCatalogReady();
  const parsedQuery = parseCatalogSearchQuery(q);
  const query = text(parsedQuery.itemQuery, 80);
  const categoryText = text(category, 80);
  const subcategoryText = text(subcategory, 80);
  const classText = text(classInfo, 80);
  const safe = safeLimit(limit, 20, 50);
  const params = [];
  const filters = ['active = true'];
  let rank = '0';

  if (query) {
    const lower = query.toLowerCase();
    params.push(`%${lower}%`);
    const likeParam = `$${params.length}`;
    params.push(lower);
    const exactParam = `$${params.length}`;
    params.push(`${lower}%`);
    const prefixParam = `$${params.length}`;
    filters.push(`(
      lower(canonical_name) like ${likeParam}
      or lower(slug) like ${likeParam}
      or exists (select 1 from unnest(coalesce(keywords,'{}'::text[])) k where lower(k) like ${likeParam})
    )`);
    rank = catalogSearchRankExpression(exactParam, prefixParam);
  }
  if (categoryText) {
    params.push(categoryText.toLowerCase());
    filters.push(`lower(coalesce(category,'')) = $${params.length}`);
  }
  if (subcategoryText) {
    params.push(subcategoryText.toLowerCase());
    filters.push(`lower(coalesce(subcategory,'')) = $${params.length}`);
  }
  if (classText) {
    params.push(`%${classText.toLowerCase()}%`);
    filters.push(`lower(coalesce(class_info,'')) like $${params.length}`);
  }
  params.push(safe);
  const result = await pool.query(`
    select id,canonical_name,slug,image_url,class_info,base_attributes,category,subcategory,keywords,
           variants,source_name,source_ref,source_license,active
    from item_catalog
    where ${filters.join(' and ')}
    order by ${rank} asc, canonical_name asc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => catalogView(row, parsedQuery.enhancement));
}

export async function listCatalogCategories() {
  await assertCatalogReady();
  const result = await pool.query(`
    select category, count(*)::int as count
    from item_catalog
    where active = true and category is not null and btrim(category) <> ''
    group by category
    order by category asc
  `);
  return result.rows.map((row) => ({ name: row.category, count: Number(row.count || 0) }));
}

export async function listCatalogFacets() {
  await assertCatalogReady();
  const [categories, subcategories, classes] = await Promise.all([
    pool.query(`
      select category as name, count(*)::int as count
      from item_catalog
      where active = true and category is not null and btrim(category) <> ''
      group by category order by category asc
    `),
    pool.query(`
      select subcategory as name, count(*)::int as count
      from item_catalog
      where active = true and subcategory is not null and btrim(subcategory) <> ''
      group by subcategory order by subcategory asc
    `),
    pool.query(`
      select btrim(class_name) as name, count(*)::int as count
      from item_catalog
      cross join lateral regexp_split_to_table(coalesce(class_info,''), ',') class_name
      where active = true and btrim(class_name) <> ''
      group by btrim(class_name) order by btrim(class_name) asc
    `),
  ]);
  const view = (rows) => rows.map((row) => ({ name: row.name, count: Number(row.count || 0) }));
  return { categories: view(categories.rows), subcategories: view(subcategories.rows), classes: view(classes.rows) };
}

export async function listCatalogMarketListings({ q = '', category = '', subcategory = '', classInfo = '', server = '', sort = 'new', minPrice = null, maxPrice = null, limit = 40, offset = 0 } = {}) {
  await assertCatalogReady({ requireListingMetadata: true });
  const parsedQuery = parseCatalogSearchQuery(q);
  const query = text(parsedQuery.itemQuery, 80);
  const categoryText = text(category, 80);
  const subcategoryText = text(subcategory, 80);
  const classText = text(classInfo, 80);
  const serverText = text(server, 32).toUpperCase();
  const safe = safeLimit(limit, 40, 80);
  const safeOffsetValue = safeOffset(offset);
  const min = minPrice == null || minPrice === '' ? null : Number(minPrice);
  const max = maxPrice == null || maxPrice === '' ? null : Number(maxPrice);
  if (min != null && (!Number.isFinite(min) || min < 0)) throw new Error('invalid min price');
  if (max != null && (!Number.isFinite(max) || max < 0)) throw new Error('invalid max price');
  if (min != null && max != null && min > max) throw new Error('invalid price range');

  const params = [];
  const filters = ["l.status = 'active'"];
  if (query) {
    params.push(`%${query.toLowerCase()}%`);
    const p = `$${params.length}`;
    filters.push(`(
      lower(l.title) like ${p}
      or lower(coalesce(l.description,'')) like ${p}
      or lower(coalesce(c.canonical_name,'')) like ${p}
      or exists (select 1 from unnest(coalesce(c.keywords,'{}'::text[])) k where lower(k) like ${p})
    )`);
  }
  if (parsedQuery.enhancement != null) {
    params.push(parsedQuery.enhancement);
    filters.push(`m.enhancement = $${params.length}::int`);
  }
  if (categoryText) {
    params.push(categoryText.toLowerCase());
    filters.push(`lower(coalesce(c.category,'')) = $${params.length}`);
  }
  if (subcategoryText) {
    params.push(subcategoryText.toLowerCase());
    filters.push(`lower(coalesce(c.subcategory,'')) = $${params.length}`);
  }
  if (classText) {
    params.push(`%${classText.toLowerCase()}%`);
    filters.push(`lower(coalesce(c.class_info,'')) like $${params.length}`);
  }
  if (serverText) {
    params.push(serverText);
    filters.push(`upper(l.server) = $${params.length}`);
  }
  if (min != null) {
    params.push(min);
    filters.push(`l.price >= $${params.length}::numeric`);
  }
  if (max != null) {
    params.push(max);
    filters.push(`l.price <= $${params.length}::numeric`);
  }

  const orderBy = ({
    price_asc: 'l.price asc, l.id desc',
    price_desc: 'l.price desc, l.id desc',
    old: 'l.id asc',
    new: 'l.id desc',
  })[String(sort)] || 'l.id desc';
  params.push(safe, safeOffsetValue);
  const result = await pool.query(`
    select l.id,l.seller_id,l.title,l.server,l.description,l.price,l.status,l.created_at,l.updated_at,
           m.enhancement,m.reverse,m.delivery_window,
           c.id as catalog_id,c.canonical_name,c.image_url,c.class_info,c.category,c.subcategory,c.base_attributes
    from listings l
    left join listing_item_metadata m on m.listing_id = l.id
    left join item_catalog c on c.id = m.item_id and c.active = true
    where ${filters.join(' and ')}
    order by ${orderBy}
    limit $${params.length - 1} offset $${params.length}
  `, params);

  return result.rows.map((row) => ({
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: row.title,
    server: row.server,
    description: row.description || '',
    price: Number(row.price),
    status: row.status,
    enhancement: row.enhancement == null ? null : Number(row.enhancement),
    reverse: row.reverse == null ? null : Boolean(row.reverse),
    deliveryWindow: row.delivery_window || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item: row.catalog_id == null ? null : {
      id: String(row.catalog_id),
      canonicalName: row.canonical_name,
      imageUrl: safeImageUrl(row.image_url),
      classInfo: row.class_info || null,
      category: row.category || null,
      subcategory: row.subcategory || null,
      baseAttributes: objectValue(row.base_attributes),
    },
  }));
}

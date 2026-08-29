import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);
const migrationUrl = new URL('../migrations/011_item_catalog_verified_expansion.sql', import.meta.url);

async function resetCatalog() {
  await pool.query('drop table if exists item_catalog cascade');
  await pool.query(`
    create table item_catalog (
      id bigserial primary key,
      canonical_name text not null,
      slug text not null unique,
      image_url text,
      class_info text,
      base_attributes jsonb not null default '{}'::jsonb,
      category text,
      subcategory text,
      keywords text[] not null default '{}'::text[],
      variants jsonb not null default '{}'::jsonb,
      source_name text,
      source_ref text,
      source_license text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

test('verified expansion migration loads six sourced items and exact sale variants', { skip: !dbReady }, async () => {
  await resetCatalog();
  try {
    const sql = await readFile(migrationUrl, 'utf8');
    await pool.query(sql);

    const count = await pool.query('select count(*)::int as count from item_catalog where active=true');
    assert.equal(Number(count.rows[0].count), 6);

    const shard = await pool.query(`
      select source_name, source_license, keywords,
             variants->'normal'->'8'->>'attackPower' as ap8,
             variants->'reverse'->'21'->>'attackPower' as reb21
      from item_catalog where slug='shard'
    `);
    assert.equal(shard.rows[0].source_name, 'Knight Online Wiki');
    assert.equal(shard.rows[0].source_license, 'CC BY-SA 4.0');
    assert.equal(shard.rows[0].keywords.includes('sh'), true);
    assert.equal(Number(shard.rows[0].ap8), 101);
    assert.equal(Number(shard.rows[0].reb21), 134);

    const mage = await pool.query(`
      select slug,
             variants->'normal'->'8'->>'attackPower' as ap8,
             variants->'reverse'->'21'->>'attackPower' as reb21
      from item_catalog
      where slug in ('wrath-of-erenion','scorching-staff')
      order by slug
    `);
    assert.deepEqual(mage.rows.map((row) => row.slug), ['scorching-staff', 'wrath-of-erenion']);
    assert.equal(Number(mage.rows[0].ap8), 122);
    assert.equal(Number(mage.rows[0].reb21), 155);
    assert.equal(Number(mage.rows[1].ap8), 100);
    assert.equal(Number(mage.rows[1].reb21), 133);
  } finally {
    await pool.query('drop table if exists item_catalog cascade');
  }
});

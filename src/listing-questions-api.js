import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';
import { createUserNotification } from './dispute-communications.js';

export const listingQuestionsRouter = Router();

export const PRESET_QUESTIONS = Object.freeze({
  STILL_AVAILABLE: 'Ürün hâlâ satılık mı?',
  DELIVERY_NOW: 'Şu an teslim edebilir misin?',
  DELIVERY_TIME: 'Tahmini teslim süresi nedir?',
  ITEM_INFO_CURRENT: 'İlandaki item bilgileri güncel mi?',
  CHECK_OFFER: 'Gönderdiğim teklifi kontrol eder misin?',
});

export const PRESET_ANSWERS = Object.freeze({
  YES_AVAILABLE: 'Evet, satılık.',
  DELIVERY_NOW: 'Evet, şu an teslim edebilirim.',
  DELIVERY_15: '15 dakika içinde teslim edebilirim.',
  DELIVERY_30: '30 dakika içinde teslim edebilirim.',
  INFO_CURRENT: 'Evet, ilan bilgileri güncel.',
  CHECKING_OFFER: 'Teklifini kontrol ediyorum.',
  OFFER_NOT_ACCEPTABLE: 'Teklifi kabul edemiyorum.',
  LISTING_PRICE_VALID: 'İlan fiyatı geçerli.',
});

const REQUIRED = Object.freeze({
  listing_questions: ['id','listing_id','buyer_id','seller_id','question_code','answer_code','status','created_at','updated_at'],
  listings: ['id','seller_id','title','server','status'],
});
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function actorId(req) {
  return numericId((req.user || req.auth)?.id, 'user id');
}

function enumCode(value, map, label) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!Object.prototype.hasOwnProperty.call(map, code)) throw new Error(`invalid ${label}`);
  return code;
}

function questionView(row) {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: row.listing_title || null,
    server: row.listing_server || null,
    questionCode: row.question_code,
    question: PRESET_QUESTIONS[row.question_code] || row.question_code,
    answerCode: row.answer_code || null,
    answer: row.answer_code ? (PRESET_ANSWERS[row.answer_code] || row.answer_code) : null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function detectListingQuestionCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('listing_questions','listings')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const [table, columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
    for (const column of columns) if (!tables.get(table)?.has(column)) blockers.push(`missing_column:${table}.${column}`);
  }
  cache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  cachedAt = Date.now();
  return cache;
}

async function assertReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.communicationWritesEnabled) throw new Error('communication writes disabled');
  const status = await detectListingQuestionCompatibility();
  if (!status.ready) throw new Error(`listing question schema incompatible: ${status.blockers.join(', ')}`);
}

export async function createPresetQuestion({ listingId, buyerId, questionCode }) {
  await assertReady({ writes: true });
  const listing = numericId(listingId, 'listing id');
  const buyer = numericId(buyerId, 'buyer id');
  const code = enumCode(questionCode, PRESET_QUESTIONS, 'question code');
  const client = await pool.connect();
  let saved;
  let listingRow;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`listing-question:${listing}:${buyer}:${code}`]);
    const listingResult = await client.query('select id,seller_id,title,server,status from listings where id=$1 for update', [listing]);
    if (!listingResult.rowCount) throw new Error('listing not found');
    listingRow = listingResult.rows[0];
    if (listingRow.status !== 'active') throw new Error('listing not available');
    if (String(listingRow.seller_id) === buyer) throw new Error('buyer and seller must differ');

    const pendingCount = await client.query(`select count(*)::int as count from listing_questions where listing_id=$1 and buyer_id=$2 and status='pending'`, [listing,buyer]);
    if (Number(pendingCount.rows[0]?.count || 0) >= 5) throw new Error('too many pending questions');

    const existing = await client.query(`
      select q.*, l.title as listing_title, l.server as listing_server
      from listing_questions q join listings l on l.id=q.listing_id
      where q.listing_id=$1 and q.buyer_id=$2 and q.question_code=$3 and q.status='pending'
      limit 1
    `, [listing,buyer,code]);
    if (existing.rowCount) {
      await client.query('commit');
      return questionView(existing.rows[0]);
    }

    const inserted = await client.query(`
      insert into listing_questions (listing_id,buyer_id,seller_id,question_code,answer_code,status,created_at,updated_at)
      values ($1,$2,$3,$4,null,'pending',now(),now())
      returning *
    `, [listing,buyer,listingRow.seller_id,code]);
    saved = inserted.rows[0];
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await createUserNotification({
    userId: listingRow.seller_id,
    kind: 'listing_preset_question',
    title: `${listingRow.title} için hazır soru`,
    body: PRESET_QUESTIONS[code],
    targetType: 'listing',
    targetId: listing,
    dedupeKey: `listing-question:${saved.id}`,
    createdBy: buyer,
  }).catch(() => null);
  return questionView({ ...saved, listing_title: listingRow.title, listing_server: listingRow.server });
}

export async function answerPresetQuestion({ questionId, sellerId, answerCode }) {
  await assertReady({ writes: true });
  const question = numericId(questionId, 'question id');
  const seller = numericId(sellerId, 'seller id');
  const code = enumCode(answerCode, PRESET_ANSWERS, 'answer code');
  const client = await pool.connect();
  let row;
  try {
    await client.query('begin');
    const result = await client.query(`
      select q.*, l.title as listing_title, l.server as listing_server
      from listing_questions q join listings l on l.id=q.listing_id
      where q.id=$1 for update
    `, [question]);
    if (!result.rowCount) throw new Error('question not found');
    row = result.rows[0];
    if (String(row.seller_id) !== seller) throw new Error('forbidden question answer');
    if (row.status !== 'pending') throw new Error('question not pending');
    const updated = await client.query(`
      update listing_questions set answer_code=$2,status='answered',updated_at=now()
      where id=$1 returning *
    `, [question,code]);
    row = { ...updated.rows[0], listing_title: row.listing_title, listing_server: row.listing_server };
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await createUserNotification({
    userId: row.buyer_id,
    kind: 'listing_preset_answer',
    title: `${row.listing_title} için satıcı yanıtı`,
    body: PRESET_ANSWERS[code],
    targetType: 'listing',
    targetId: row.listing_id,
    dedupeKey: `listing-question-answer:${row.id}:${code}`,
    createdBy: seller,
  }).catch(() => null);
  return questionView(row);
}

export async function listBuyerQuestions({ buyerId, listingId = null, limit = 50 }) {
  await assertReady();
  const buyer = numericId(buyerId, 'buyer id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit),10) || 50));
  const params = [buyer];
  let filter = 'q.buyer_id=$1';
  if (listingId != null) {
    params.push(numericId(listingId, 'listing id'));
    filter += ` and q.listing_id=$${params.length}`;
  }
  params.push(safeLimit);
  const result = await pool.query(`
    select q.*,l.title as listing_title,l.server as listing_server
    from listing_questions q join listings l on l.id=q.listing_id
    where ${filter} order by q.id desc limit $${params.length}
  `, params);
  return result.rows.map(questionView);
}

export async function listSellerQuestionInbox({ sellerId, limit = 50 }) {
  await assertReady();
  const seller = numericId(sellerId, 'seller id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit),10) || 50));
  const result = await pool.query(`
    select q.*,l.title as listing_title,l.server as listing_server
    from listing_questions q join listings l on l.id=q.listing_id
    where q.seller_id=$1 order by (q.status='pending') desc,q.id desc limit $2
  `, [seller,safeLimit]);
  return result.rows.map(questionView);
}

function apiError(res,error) {
  const message = String(error?.message || 'listing_question_error');
  if (message.includes('not found')) return res.status(404).json({ok:false,error:'not_found'});
  if (message.includes('forbidden')) return res.status(403).json({ok:false,error:'forbidden'});
  if (message.includes('buyer and seller')) return res.status(409).json({ok:false,error:'self_question_not_allowed'});
  if (message.includes('too many')) return res.status(429).json({ok:false,error:'too_many_pending_questions'});
  if (message.includes('not available') || message.includes('not pending')) return res.status(409).json({ok:false,error:'question_not_available'});
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) return res.status(503).json({ok:false,error:'preset_questions_temporarily_unavailable'});
  if (message.includes('invalid')) return res.status(400).json({ok:false,error:'invalid_preset_question'});
  console.error('[KOTAKAS] listing question error:', message);
  return res.status(503).json({ok:false,error:'preset_questions_temporarily_unavailable'});
}

listingQuestionsRouter.get('/listing-questions/presets', (_req,res) => res.json({ok:true,questions:PRESET_QUESTIONS,answers:PRESET_ANSWERS}));
listingQuestionsRouter.post('/listing-questions', requireAuthenticated, async (req,res) => {
  try { return res.status(201).json({ok:true,question:await createPresetQuestion({listingId:req.body?.listingId,buyerId:actorId(req),questionCode:req.body?.questionCode})}); }
  catch (error) { return apiError(res,error); }
});
listingQuestionsRouter.get('/listing-questions/mine', requireAuthenticated, async (req,res) => {
  try { return res.json({ok:true,questions:await listBuyerQuestions({buyerId:actorId(req),listingId:req.query.listingId,limit:req.query.limit})}); }
  catch (error) { return apiError(res,error); }
});
listingQuestionsRouter.get('/listing-questions/inbox', requireAuthenticated, async (req,res) => {
  try { return res.json({ok:true,questions:await listSellerQuestionInbox({sellerId:actorId(req),limit:req.query.limit})}); }
  catch (error) { return apiError(res,error); }
});
listingQuestionsRouter.post('/listing-questions/:questionId/answer', requireAuthenticated, async (req,res) => {
  try { return res.json({ok:true,question:await answerPresetQuestion({questionId:req.params.questionId,sellerId:actorId(req),answerCode:req.body?.answerCode})}); }
  catch (error) { return apiError(res,error); }
});

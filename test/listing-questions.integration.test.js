import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import {
  answerPresetQuestion,
  createPresetQuestion,
  detectListingQuestionCompatibility,
  listBuyerQuestions,
  listSellerQuestionInbox,
} from '../src/listing-questions-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists user_notifications, listing_questions, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      status text not null
    );
    create table listing_questions (
      id bigserial primary key,
      listing_id bigint not null references listings(id) on delete cascade,
      buyer_id bigint not null,
      seller_id bigint not null,
      question_code text not null,
      answer_code text,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    insert into listings (id,seller_id,title,server,status) values (1,200,'Raptor +8','ZERO','active');
  `);
  await detectListingQuestionCompatibility({ force: true });
}

test('preset-only question flow stores codes and does not expose buyer identity in views', { skip: !dbReady }, async () => {
  await resetSchema();
  const old = config.communicationWritesEnabled;
  config.communicationWritesEnabled = true;
  try {
    const question = await createPresetQuestion({ listingId: 1, buyerId: 300, questionCode: 'DELIVERY_TIME' });
    assert.equal(question.question, 'Tahmini teslim süresi nedir?');
    assert.equal(Object.prototype.hasOwnProperty.call(question, 'buyerId'), false);

    const inbox = await listSellerQuestionInbox({ sellerId: 200 });
    assert.equal(inbox.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(inbox[0], 'buyerId'), false);

    const answered = await answerPresetQuestion({ questionId: question.id, sellerId: 200, answerCode: 'DELIVERY_15' });
    assert.equal(answered.answer, '15 dakika içinde teslim edebilirim.');
    assert.equal(answered.status, 'answered');

    const mine = await listBuyerQuestions({ buyerId: 300, listingId: 1 });
    assert.equal(mine[0].answerCode, 'DELIVERY_15');
    await assert.rejects(createPresetQuestion({ listingId: 1, buyerId: 200, questionCode: 'STILL_AVAILABLE' }), /buyer and seller must differ/);
  } finally {
    config.communicationWritesEnabled = old;
    await pool.query('drop table if exists user_notifications, listing_questions, listings cascade');
  }
});

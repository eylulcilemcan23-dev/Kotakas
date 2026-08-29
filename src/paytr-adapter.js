import crypto from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';
import { applyProviderPaymentEvent, createDepositIntent } from './payment-funding.js';

const PAYTR_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const PAYTR_IFRAME_BASE = 'https://www.paytr.com/odeme/guvenli/';

function safeText(value, max, label, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) throw new Error(`invalid ${label}`);
  return text;
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function amountMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid amount');
  return String(Math.round((amount + Number.EPSILON) * 100));
}

function normalizeMerchantOid(value) {
  const oid = safeText(value, 64, 'merchant oid');
  if (!/^[A-Za-z0-9]+$/.test(oid)) throw new Error('invalid merchant oid');
  return oid;
}

function normalizeEmail(value) {
  const email = safeText(value, 100, 'payment email').toLowerCase();
  if (!/^[\x20-\x7E]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('invalid payment email');
  }
  return email;
}

function normalizePhone(value) {
  const phone = safeText(value, 20, 'payment phone', 7);
  if (!/^[0-9+() .-]+$/.test(phone)) throw new Error('invalid payment phone');
  return phone;
}

function normalizeIp(value) {
  let ip = safeText(value, 80, 'user ip');
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!ip || ip.length > 39 || !/^[0-9A-Fa-f:.]+$/.test(ip)) throw new Error('invalid user ip');
  return ip;
}

function paymentView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    currency: row.currency,
    provider: row.provider,
    merchantReference: row.merchant_reference,
    status: row.status,
    checkoutUrl: row.checkout_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at || null,
  };
}

function assertPaytrCredentials() {
  if (config.paymentProvider !== 'paytr') throw new Error('payment provider disabled');
  safeText(config.paytrMerchantId, 80, 'paytr merchant id');
  safeText(config.paytrMerchantKey, 512, 'paytr merchant key', 8);
  safeText(config.paytrMerchantSalt, 512, 'paytr merchant salt', 8);
}

function publicBaseUrl() {
  const raw = safeText(config.paymentPublicBaseUrl, 400, 'payment public base url');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('invalid payment public base url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid payment public base url');
  if (config.nodeEnv === 'production' && parsed.protocol !== 'https:') throw new Error('invalid payment public base url');
  return parsed.origin;
}

export function paytrProviderConfigured() {
  try {
    assertPaytrCredentials();
    return true;
  } catch {
    return false;
  }
}

export function paytrCheckoutReady() {
  try {
    assertPaytrCredentials();
    publicBaseUrl();
    return Boolean(config.paymentWritesEnabled && config.financeWritesEnabled);
  } catch {
    return false;
  }
}

export function paytrCallbackReady() {
  return Boolean(paytrProviderConfigured() && config.paymentWritesEnabled && config.financeWritesEnabled);
}

export function paymentClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const realIp = req?.headers?.['x-real-ip'];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string' && forwarded.trim()
      ? forwarded
      : typeof realIp === 'string' && realIp.trim()
        ? realIp
        : req?.socket?.remoteAddress || req?.ip || '';
  return normalizeIp(raw);
}

export function buildPaytrIframePayload({ merchantOid, email, amount, userIp, userName, userAddress, userPhone }) {
  assertPaytrCredentials();
  const oid = normalizeMerchantOid(merchantOid);
  const safeEmail = normalizeEmail(email);
  const safeAmount = amountMinor(amount);
  const safeIp = normalizeIp(userIp);
  const safeName = safeText(userName, 60, 'payment user name', 2);
  const safeAddress = safeText(userAddress, 400, 'payment user address', 5);
  const safePhone = normalizePhone(userPhone);
  const basket = Buffer.from(JSON.stringify([['KOTAKAS Bakiye Yükleme', Number(amount).toFixed(2), 1]]), 'utf8').toString('base64');
  const base = publicBaseUrl();
  const noInstallment = config.paytrNoInstallment ? '1' : '0';
  const maxInstallment = noInstallment === '1' ? '0' : String(config.paytrMaxInstallment || 0);
  const testMode = config.paytrTestMode ? '1' : '0';
  const currency = 'TL';
  const hashSource = `${config.paytrMerchantId}${safeIp}${oid}${safeEmail}${safeAmount}${basket}${noInstallment}${maxInstallment}${currency}${testMode}${config.paytrMerchantSalt}`;
  const paytrToken = crypto.createHmac('sha256', config.paytrMerchantKey).update(hashSource).digest('base64');

  return {
    merchant_id: String(config.paytrMerchantId),
    user_ip: safeIp,
    merchant_oid: oid,
    email: safeEmail,
    payment_amount: safeAmount,
    paytr_token: paytrToken,
    user_basket: basket,
    debug_on: config.paytrDebugOn ? '1' : '0',
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: safeName,
    user_address: safeAddress,
    user_phone: safePhone,
    merchant_ok_url: `${base}/dashboard.html?payment=success`,
    merchant_fail_url: `${base}/dashboard.html?payment=failed`,
    timeout_limit: String(config.paytrTimeoutMinutes),
    currency,
    test_mode: testMode,
    lang: 'tr',
  };
}

export async function requestPaytrIframeToken(input, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('payment provider unavailable');
  const payload = buildPaytrIframePayload(input);
  const body = new URLSearchParams(payload);
  let response;
  try {
    response = await fetchImpl(PAYTR_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: globalThis.AbortSignal?.timeout ? AbortSignal.timeout(20_000) : undefined,
    });
  } catch {
    throw new Error('payment provider unavailable');
  }
  const raw = await response.text().catch(() => '');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('payment provider invalid response');
  }
  if (!response.ok || data?.status !== 'success' || typeof data?.token !== 'string' || !data.token.trim()) {
    throw new Error('payment provider checkout rejected');
  }
  const token = data.token.trim();
  if (token.length > 500 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('payment provider invalid response');
  return { token, iframeUrl: `${PAYTR_IFRAME_BASE}${encodeURIComponent(token)}` };
}

async function lockPaytrIntent(client, intentId) {
  await client.query('select pg_advisory_lock(hashtextextended($1,0))', [`paytr-checkout:${intentId}`]);
  const result = await client.query('select * from wallet_payment_intents where id=$1', [intentId]);
  if (!result.rowCount) throw new Error('payment intent not found');
  return result.rows[0];
}

async function unlockPaytrIntent(client, intentId) {
  await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [`paytr-checkout:${intentId}`]).catch(() => null);
}

async function ensurePaytrMerchantOid(client, row) {
  const current = String(row.merchant_reference || '');
  if (/^[A-Za-z0-9]{1,64}$/.test(current)) return row;
  const oid = `KOTP${String(row.id)}${crypto.randomBytes(10).toString('hex')}`.slice(0, 64);
  const result = await client.query(`
    update wallet_payment_intents
    set merchant_reference=$2,updated_at=now()
    where id=$1 and status in ('created','pending')
    returning *
  `, [row.id, oid]);
  if (!result.rowCount) throw new Error('payment intent not payable');
  return result.rows[0];
}

export async function createPaytrDepositCheckout({
  userId,
  amount,
  idempotencyKey,
  email,
  userName,
  userAddress,
  userPhone,
  userIp,
  fetchImpl = globalThis.fetch,
}) {
  if (!paytrCheckoutReady()) throw new Error('payment provider checkout not ready');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < config.depositMinAmount || numericAmount > config.depositMaxAmount) {
    throw new Error('deposit amount outside limits');
  }
  const intent = await createDepositIntent({ userId, amount: numericAmount, idempotencyKey, provider: 'paytr' });
  const client = await pool.connect();
  try {
    let row = await lockPaytrIntent(client, intent.id);
    if (row.status === 'paid') return paymentView(row);
    if (row.status === 'pending' && typeof row.checkout_url === 'string' && row.checkout_url.startsWith(PAYTR_IFRAME_BASE)) {
      return paymentView(row);
    }
    if (!['created', 'pending'].includes(row.status)) throw new Error(`payment intent not payable:${row.status}`);
    row = await ensurePaytrMerchantOid(client, row);
    const checkout = await requestPaytrIframeToken({
      merchantOid: row.merchant_reference,
      email,
      amount: row.amount,
      userIp,
      userName,
      userAddress,
      userPhone,
    }, { fetchImpl });
    const updated = await client.query(`
      update wallet_payment_intents
      set status='pending',checkout_url=$2,updated_at=now()
      where id=$1 and status in ('created','pending')
      returning *
    `, [row.id, checkout.iframeUrl]);
    if (!updated.rowCount) throw new Error('payment intent not payable');
    return paymentView(updated.rows[0]);
  } finally {
    await unlockPaytrIntent(client, intent.id);
    client.release();
  }
}

export function signPaytrCallback(input) {
  assertPaytrCredentials();
  const oid = normalizeMerchantOid(input?.merchant_oid);
  const status = safeText(input?.status, 20, 'paytr status').toLowerCase();
  const totalAmount = safeText(String(input?.total_amount ?? ''), 30, 'paytr total amount');
  if (!/^[0-9]+$/.test(totalAmount) || !['success', 'failed'].includes(status)) throw new Error('invalid paytr callback');
  const source = `${oid}${config.paytrMerchantSalt}${status}${totalAmount}`;
  return crypto.createHmac('sha256', config.paytrMerchantKey).update(source).digest('base64');
}

export function verifyPaytrCallback(input) {
  try {
    const provided = safeText(input?.hash, 512, 'paytr hash');
    return timingSafeTextEqual(provided, signPaytrCallback(input));
  } catch {
    return false;
  }
}

export function paytrCallbackToProviderEvent(input, fallbackAmount) {
  const oid = normalizeMerchantOid(input?.merchant_oid);
  const status = safeText(input?.status, 20, 'paytr status').toLowerCase();
  if (!['success', 'failed'].includes(status)) throw new Error('invalid paytr callback');
  const totalAmount = safeText(String(input?.total_amount ?? ''), 30, 'paytr total amount');
  if (!/^[0-9]+$/.test(totalAmount)) throw new Error('invalid paytr callback');
  const currencyRaw = String(input?.currency || 'TL').trim().toUpperCase();
  if (!['TL', 'TRY'].includes(currencyRaw)) throw new Error('invalid currency');

  let amount;
  if (status === 'success') {
    const paymentAmount = safeText(String(input?.payment_amount ?? ''), 30, 'paytr payment amount');
    if (!/^[0-9]+$/.test(paymentAmount)) throw new Error('invalid paytr callback');
    amount = Number(paymentAmount) / 100;
  } else {
    amount = Number(fallbackAmount);
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid amount');

  return {
    eventId: `paytr:${oid}:${status}:${totalAmount}`,
    merchantReference: oid,
    providerPaymentId: status === 'success' ? `paytr:${oid}` : '',
    status: status === 'success' ? 'paid' : 'failed',
    amount,
    currency: 'TRY',
  };
}

export async function processPaytrCallback(input) {
  if (!paytrCallbackReady()) throw new Error('payment provider callback not ready');
  if (!verifyPaytrCallback(input)) throw new Error('invalid paytr callback signature');
  const oid = normalizeMerchantOid(input?.merchant_oid);
  const intent = await pool.query(`
    select * from wallet_payment_intents where merchant_reference=$1 limit 1
  `, [oid]);
  if (!intent.rowCount) throw new Error('payment intent not found');
  const event = paytrCallbackToProviderEvent(input, Number(intent.rows[0].amount));
  return applyProviderPaymentEvent(event, { provider: 'paytr' });
}

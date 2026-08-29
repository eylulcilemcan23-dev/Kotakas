import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import {
  buildPaytrIframePayload,
  paytrCallbackToProviderEvent,
  requestPaytrIframeToken,
  verifyPaytrCallback,
} from '../src/paytr-adapter.js';

function withPaytrConfig() {
  const old = {
    paymentProvider: config.paymentProvider,
    paytrMerchantId: config.paytrMerchantId,
    paytrMerchantKey: config.paytrMerchantKey,
    paytrMerchantSalt: config.paytrMerchantSalt,
    paymentPublicBaseUrl: config.paymentPublicBaseUrl,
    paytrTestMode: config.paytrTestMode,
    paytrDebugOn: config.paytrDebugOn,
    paytrNoInstallment: config.paytrNoInstallment,
    paytrMaxInstallment: config.paytrMaxInstallment,
    paytrTimeoutMinutes: config.paytrTimeoutMinutes,
  };
  Object.assign(config, {
    paymentProvider: 'paytr',
    paytrMerchantId: '123456',
    paytrMerchantKey: 'merchant-key-test-123',
    paytrMerchantSalt: 'merchant-salt-test-456',
    paymentPublicBaseUrl: 'https://staging.kotakas.test',
    paytrTestMode: true,
    paytrDebugOn: true,
    paytrNoInstallment: true,
    paytrMaxInstallment: 0,
    paytrTimeoutMinutes: 30,
  });
  return () => Object.assign(config, old);
}

test('PayTR iframe token follows official field order and never posts merchant secrets', async () => {
  const restore = withPaytrConfig();
  try {
    const input = {
      merchantOid: 'KOTP123ABC',
      email: 'user@example.com',
      amount: 125.5,
      userIp: '1.2.3.4',
      userName: 'Test User',
      userAddress: 'Antalya Türkiye',
      userPhone: '05551234567',
    };
    const payload = buildPaytrIframePayload(input);
    assert.equal(payload.payment_amount, '12550');
    assert.equal(payload.currency, 'TL');
    assert.equal(payload.no_installment, '1');
    assert.equal(payload.test_mode, '1');
    assert.deepEqual(JSON.parse(Buffer.from(payload.user_basket, 'base64').toString('utf8')), [
      ['KOTAKAS Bakiye Yükleme', '125.50', 1],
    ]);

    const source = `${payload.merchant_id}${payload.user_ip}${payload.merchant_oid}${payload.email}${payload.payment_amount}${payload.user_basket}${payload.no_installment}${payload.max_installment}${payload.currency}${payload.test_mode}${config.paytrMerchantSalt}`;
    const expected = crypto.createHmac('sha256', config.paytrMerchantKey).update(source).digest('base64');
    assert.equal(payload.paytr_token, expected);

    let posted = null;
    const checkout = await requestPaytrIframeToken(input, {
      fetchImpl: async (_url, options) => {
        posted = new URLSearchParams(String(options.body));
        return { ok: true, text: async () => JSON.stringify({ status: 'success', token: 'iframeTokenABC123' }) };
      },
    });
    assert.equal(checkout.iframeUrl, 'https://www.paytr.com/odeme/guvenli/iframeTokenABC123');
    assert.equal(posted.get('merchant_id'), '123456');
    assert.equal(posted.has('merchant_key'), false);
    assert.equal(posted.has('merchant_salt'), false);
  } finally {
    restore();
  }
});

test('PayTR callback hash is checked before mapping to a wallet credit event', () => {
  const restore = withPaytrConfig();
  try {
    const callback = {
      merchant_oid: 'KOTP123ABC',
      status: 'success',
      total_amount: '12550',
      payment_amount: '12550',
      currency: 'TL',
    };
    const source = `${callback.merchant_oid}${config.paytrMerchantSalt}${callback.status}${callback.total_amount}`;
    callback.hash = crypto.createHmac('sha256', config.paytrMerchantKey).update(source).digest('base64');
    assert.equal(verifyPaytrCallback(callback), true);
    assert.equal(verifyPaytrCallback({ ...callback, total_amount: '12600' }), false);

    const event = paytrCallbackToProviderEvent(callback, 125.5);
    assert.deepEqual(event, {
      eventId: 'paytr:KOTP123ABC:success:12550',
      merchantReference: 'KOTP123ABC',
      providerPaymentId: 'paytr:KOTP123ABC',
      status: 'paid',
      amount: 125.5,
      currency: 'TRY',
    });
  } finally {
    restore();
  }
});

import { ROLES } from '../auth/roles.js';

export const FREE_USER_LISTINGS_PER_MONTH = 1;
export const FREE_FORM_CHAT_ENABLED = false;

export const READY_SELLER_QUESTIONS = Object.freeze([
  'Ürün hâlâ satılık mı?',
  'Son fiyat nedir?',
  'Bu fiyata olur mu?',
  'Teklifimi kabul eder misiniz?',
  'İlan bilgileri güncel mi?'
]);

export const READY_SELLER_ANSWERS = Object.freeze([
  'Evet, ürün satılık.',
  'Hayır, ürün artık satılık değil.',
  'İlandaki fiyat güncel.',
  'Teklifinizi kabul ediyorum.',
  'Teklifinizi kabul etmiyorum.'
]);

const blockedContactPatterns = [
  /https?:\/\//i,
  /www\./i,
  /(?:wa\.me|whatsapp|telegram|t\.me|discord|instagram|insta\b)/i,
  /@[a-z0-9._]{3,}/i,
  /(?:\+?90\s*)?(?:0?5\d{2})[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/i,
  /(?:telefon|tel\b|gsm|numara|wp\b|dm\b)\s*[:=-]?\s*\d/i
];

export function containsExternalContact(text = '') {
  const normalized = String(text).trim();
  if (!normalized) return false;
  return blockedContactPatterns.some((pattern) => pattern.test(normalized));
}

export function validateMarketplaceText(text = '') {
  if (containsExternalContact(text)) {
    return {
      ok: false,
      error: 'external_contact_blocked',
      message: 'Site dışı iletişim bilgisi paylaşımı engellendi.'
    };
  }
  return { ok: true };
}

export function isReadyQuestion(message = '') {
  return READY_SELLER_QUESTIONS.includes(String(message).trim());
}

export function isReadyAnswer(message = '') {
  return READY_SELLER_ANSWERS.includes(String(message).trim());
}

export function canSendSellerQuestion(message = '') {
  if (FREE_FORM_CHAT_ENABLED) return validateMarketplaceText(message);
  if (!isReadyQuestion(message)) {
    return {
      ok: false,
      error: 'free_form_chat_disabled',
      message: 'Yalnızca KOTAKAS hazır soruları kullanılabilir.'
    };
  }
  return { ok: true };
}

export function canSendSellerAnswer(message = '') {
  if (FREE_FORM_CHAT_ENABLED) return validateMarketplaceText(message);
  if (!isReadyAnswer(message)) {
    return {
      ok: false,
      error: 'free_form_chat_disabled',
      message: 'Yalnızca KOTAKAS hazır cevapları kullanılabilir.'
    };
  }
  return { ok: true };
}

export function getMonthlyFreeListingAllowance(role) {
  return role === ROLES.USER ? FREE_USER_LISTINGS_PER_MONTH : 0;
}

export function userCanPublishFree({ role, publishedThisMonth = 0 }) {
  const allowance = getMonthlyFreeListingAllowance(role);
  return allowance > Number(publishedThisMonth || 0);
}

export function calculateCommission({ role, grossAmount, normalRate = 4, traderRate = 3 }) {
  const gross = Number(grossAmount || 0);
  if (!Number.isFinite(gross) || gross < 0) throw new Error('invalid_gross_amount');

  const rate = role === ROLES.TRADER ? Number(traderRate) : Number(normalRate);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('invalid_commission_rate');

  const fee = Number((gross * rate / 100).toFixed(2));
  return {
    gross,
    rate,
    fee,
    net: Number((gross - fee).toFixed(2))
  };
}

import { ROLES } from '../auth/roles.js';
import { FREE_USER_LISTINGS_PER_MONTH, validateMarketplaceText } from '../domain/marketplace-policy.js';

export function normalizeServerCode(value = '') {
  return String(value).trim().toUpperCase();
}

export function validateListingInput(input = {}) {
  const serverCode = normalizeServerCode(input.serverCode);
  const itemName = String(input.itemName || '').trim();
  const category = String(input.category || '').trim();
  const description = String(input.description || '').trim();
  const priceGb = Number(input.priceGb);

  if (!/^[A-Z0-9_-]{2,24}$/.test(serverCode)) return { ok: false, error: 'invalid_server' };
  if (itemName.length < 2 || itemName.length > 120) return { ok: false, error: 'invalid_item_name' };
  if (category.length > 60) return { ok: false, error: 'invalid_category' };
  if (description.length > 1500) return { ok: false, error: 'description_too_long' };
  if (!Number.isFinite(priceGb) || priceGb <= 0 || priceGb > 1_000_000) return { ok: false, error: 'invalid_price_gb' };

  for (const text of [itemName, description]) {
    const validation = validateMarketplaceText(text);
    if (!validation.ok) return validation;
  }

  return {
    ok: true,
    value: {
      serverCode,
      itemName,
      category: category || null,
      description: description || null,
      priceGb: Math.round(priceGb * 10_000) / 10_000
    }
  };
}

export function getPublicationDecision({ role, publishedThisMonth = 0 }) {
  if (role === ROLES.TRADER) {
    return { allowed: true, publicationType: 'trader', requiresPayment: false, freeRemaining: null };
  }

  if (role === ROLES.USER) {
    const used = Math.max(0, Number(publishedThisMonth) || 0);
    if (used < FREE_USER_LISTINGS_PER_MONTH) {
      return {
        allowed: true,
        publicationType: 'free',
        requiresPayment: false,
        freeRemaining: FREE_USER_LISTINGS_PER_MONTH - used - 1
      };
    }

    return {
      allowed: false,
      publicationType: 'paid',
      requiresPayment: true,
      freeRemaining: 0,
      error: 'paid_listing_required'
    };
  }

  return { allowed: false, publicationType: null, requiresPayment: false, error: 'seller_role_required' };
}

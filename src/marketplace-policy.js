import { config } from './config.js';
import { normalizeRole, ROLES } from './roles.js';

const CONTACT_PATTERNS = Object.freeze([
  { type: 'url', pattern: /(?:https?:\/\/|www\.)/i },
  { type: 'social', pattern: /\b(?:whats?app|instagram|insta\b|telegram|t\.me|discord(?:\.gg)?|facebook|messenger|snapchat)\b/i },
  { type: 'handle', pattern: /(?:^|\s)@[a-z0-9._]{3,}/i },
  { type: 'phone', pattern: /(?:\+?90[\s.-]*)?(?:\(?0?5\d{2}\)?[\s.-]*)\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/ },
]);

export function externalContactType(value) {
  const text = typeof value === 'string' ? value : '';
  for (const rule of CONTACT_PATTERNS) {
    if (rule.pattern.test(text)) return rule.type;
  }
  return null;
}

export function assertListingContentSafe({ title = '', description = '' } = {}) {
  const type = externalContactType(`${title}\n${description}`);
  if (type) throw new Error(`external contact info not allowed:${type}`);
  return true;
}

export function traderCommissionRate() {
  const rate = Number(config.traderCommissionRate ?? config.commissionRate ?? 0);
  if (!Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

export function commissionRateForSellerRole(role) {
  return normalizeRole(role) === ROLES.TRADER ? traderCommissionRate() : 0;
}

export function monthlyListingLimitForRole(role) {
  if (normalizeRole(role) === ROLES.TRADER) return null;
  const configured = Number.parseInt(String(config.normalUserMonthlyListingLimit ?? 1), 10);
  return Math.max(1, Number.isFinite(configured) ? configured : 1);
}

export async function getListingAllowance(queryable, sellerId, role) {
  const normalizedRole = normalizeRole(role);
  const limit = monthlyListingLimitForRole(normalizedRole);
  if (limit == null) {
    return {
      role: normalizedRole,
      unlimited: true,
      limit: null,
      used: null,
      remaining: null,
      commissionRate: commissionRateForSellerRole(normalizedRole),
    };
  }

  const result = await queryable.query(`
    select count(*)::int as used
    from listings
    where seller_id = $1
      and created_at >= date_trunc('month', now())
      and created_at < date_trunc('month', now()) + interval '1 month'
  `, [sellerId]);
  const used = Number(result.rows[0]?.used || 0);
  return {
    role: normalizedRole,
    unlimited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    commissionRate: 0,
  };
}

export async function assertListingAllowance(queryable, sellerId, role) {
  const allowance = await getListingAllowance(queryable, sellerId, role);
  if (!allowance.unlimited && allowance.remaining <= 0) throw new Error('monthly listing limit reached');
  return allowance;
}

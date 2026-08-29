import { ROLES } from '../auth/roles.js';

export function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('invalid_money');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function commissionRateForRole(role, { normalRate = 4, traderRate = 3 } = {}) {
  const rate = role === ROLES.TRADER ? Number(traderRate) : Number(normalRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('invalid_commission_rate');
  return rate;
}

export function calculateSettlement({ sellerRole, grossAmount, normalRate = 4, traderRate = 3 }) {
  const gross = roundMoney(grossAmount);
  if (gross <= 0) throw new Error('invalid_gross_amount');

  const commissionRate = commissionRateForRole(sellerRole, { normalRate, traderRate });
  const commission = roundMoney(gross * commissionRate / 100);
  const sellerNet = roundMoney(gross - commission);

  return { gross, commissionRate, commission, sellerNet };
}

export function validateBalanceAdjustment(amount) {
  const value = roundMoney(amount);
  if (value === 0) throw new Error('zero_adjustment_not_allowed');
  if (Math.abs(value) > 10_000_000) throw new Error('adjustment_too_large');
  return value;
}

export const ESCROW_STATES = Object.freeze({
  HELD: 'held',
  RELEASED: 'released',
  REFUNDED: 'refunded',
});

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function buildEscrowSettlement(amount, commissionRate) {
  const gross = Number(amount);
  const rate = Number(commissionRate);
  if (!Number.isFinite(gross) || gross <= 0) throw new Error('invalid amount');
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('invalid commission rate');

  const commission = roundMoney(gross * rate);
  const sellerNet = roundMoney(gross - commission);
  const check = roundMoney(sellerNet + commission);
  if (check !== roundMoney(gross)) throw new Error('settlement invariant failed');

  return Object.freeze({
    buyerDebit: roundMoney(gross),
    heldAmount: roundMoney(gross),
    sellerCredit: sellerNet,
    platformCredit: commission,
    commissionRate: rate,
  });
}

export function assertEscrowTransition(from, to) {
  const allowed = from === ESCROW_STATES.HELD && [ESCROW_STATES.RELEASED, ESCROW_STATES.REFUNDED].includes(to);
  if (!allowed) throw new Error(`invalid escrow transition: ${from} -> ${to}`);
  return true;
}

export function buildReleasePlan({ amount, commissionRate, buyerId, sellerId, orderId }) {
  if (buyerId == null || sellerId == null || orderId == null) throw new Error('missing escrow identity');
  const settlement = buildEscrowSettlement(amount, commissionRate);
  return Object.freeze({
    orderId,
    buyerId,
    sellerId,
    fromState: ESCROW_STATES.HELD,
    toState: ESCROW_STATES.RELEASED,
    ...settlement,
  });
}

export function buildRefundPlan({ amount, buyerId, sellerId, orderId }) {
  const gross = Number(amount);
  if (!Number.isFinite(gross) || gross <= 0) throw new Error('invalid amount');
  if (buyerId == null || sellerId == null || orderId == null) throw new Error('missing escrow identity');
  return Object.freeze({
    orderId,
    buyerId,
    sellerId,
    fromState: ESCROW_STATES.HELD,
    toState: ESCROW_STATES.REFUNDED,
    buyerCredit: roundMoney(gross),
    sellerCredit: 0,
    platformCredit: 0,
  });
}

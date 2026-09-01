const SIDES = new Set(['buy', 'sell']);
const ASSET_TYPES = new Set(['item', 'ring', 'gb', 'other']);

export function normalizeServerCode(value = '') {
  return String(value).trim().toUpperCase();
}

export function validateCompletedTradeInput(input = {}) {
  const side = String(input.side || '').trim().toLowerCase();
  const assetType = String(input.assetType || 'item').trim().toLowerCase();
  const serverCode = normalizeServerCode(input.serverCode);
  const assetName = String(input.assetName || '').trim();
  const note = String(input.note || '').trim();
  const quantity = Number(input.quantity ?? 1);
  const unitPriceGb = Number(input.unitPriceGb);
  const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();

  if (!SIDES.has(side)) return { ok: false, error: 'invalid_side' };
  if (!ASSET_TYPES.has(assetType)) return { ok: false, error: 'invalid_asset_type' };
  if (!/^[A-Z0-9_-]{2,24}$/.test(serverCode)) return { ok: false, error: 'invalid_server' };
  if (assetName.length < 2 || assetName.length > 120) return { ok: false, error: 'invalid_asset_name' };
  if (note.length > 500) return { ok: false, error: 'note_too_long' };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return { ok: false, error: 'invalid_quantity' };
  if (!Number.isFinite(unitPriceGb) || unitPriceGb <= 0 || unitPriceGb > 1_000_000) return { ok: false, error: 'invalid_unit_price_gb' };
  if (Number.isNaN(completedAt.getTime())) return { ok: false, error: 'invalid_completed_at' };
  if (completedAt.getTime() > Date.now() + 5 * 60 * 1000) return { ok: false, error: 'completed_at_in_future' };

  const roundedQuantity = Math.round(quantity * 10_000) / 10_000;
  const roundedUnitPriceGb = Math.round(unitPriceGb * 10_000) / 10_000;
  const totalGb = Math.round(roundedQuantity * roundedUnitPriceGb * 10_000) / 10_000;

  return {
    ok: true,
    value: {
      side,
      assetType,
      serverCode,
      assetName,
      note: note || null,
      quantity: roundedQuantity,
      unitPriceGb: roundedUnitPriceGb,
      totalGb,
      completedAt: completedAt.toISOString()
    }
  };
}

import { Router } from 'express';
import { config } from './config.js';
import { requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { detectFinanceSchema } from './finance-adapter.js';

export const financeStatusRouter = Router();

financeStatusRouter.get('/admin/finance-compatibility', requirePermission(PERMISSIONS.FINANCE), async (_req, res) => {
  const status = await detectFinanceSchema();
  const blockedBy = [];
  if (!config.financeWritesEnabled) blockedBy.push('FINANCE_WRITES_ENABLED=false');
  if (!status.ready) blockedBy.push('wallet/transaction schema not confirmed');
  if (!status.orderReady) blockedBy.push('order/deal schema not confirmed');

  res.json({
    ok: true,
    ready: status.ready,
    commissionReady: status.commissionReady,
    orderReady: status.orderReady,
    writesEnabled: config.financeWritesEnabled,
    escrowWriteReady: blockedBy.length === 0,
    blockedBy,
  });
});

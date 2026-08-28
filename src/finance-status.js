import { Router } from 'express';
import { requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { detectFinanceSchema } from './finance-adapter.js';

export const financeStatusRouter = Router();

financeStatusRouter.get('/admin/finance-compatibility', requirePermission(PERMISSIONS.FINANCE), async (_req, res) => {
  const status = await detectFinanceSchema();
  res.json({
    ok: true,
    ready: status.ready,
    commissionReady: status.commissionReady,
    orderReady: status.orderReady,
  });
});

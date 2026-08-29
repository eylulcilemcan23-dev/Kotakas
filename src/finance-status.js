import { Router } from 'express';
import { config } from './config.js';
import { requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { detectFinanceSchema } from './finance-adapter.js';
import { detectFinanceWriteCompatibility } from './finance-write-adapter.js';
import { detectUserSchema } from './user-adapter.js';

export const financeStatusRouter = Router();

financeStatusRouter.get('/admin/finance-compatibility', requirePermission(PERMISSIONS.FINANCE), async (_req, res) => {
  const [status, writeStatus] = await Promise.all([
    detectFinanceSchema(),
    detectFinanceWriteCompatibility(),
  ]);
  const blockedBy = [...writeStatus.blockers];
  if (!config.financeWritesEnabled) blockedBy.unshift('FINANCE_WRITES_ENABLED=false');

  res.json({
    ok: true,
    ready: status.ready,
    commissionReady: status.commissionReady,
    orderReady: status.orderReady,
    writesEnabled: config.financeWritesEnabled,
    writeSchemaReady: writeStatus.ready,
    escrowWriteReady: config.financeWritesEnabled && writeStatus.ready,
    blockedBy,
  });
});

financeStatusRouter.get('/admin/schema-compatibility', requirePermission(PERMISSIONS.FINANCE), async (_req, res) => {
  try {
    const [userSchema, financeSchema, financeWriteSchema] = await Promise.all([
      detectUserSchema({ force: true }),
      detectFinanceSchema({ force: true }),
      detectFinanceWriteCompatibility({ force: true }),
    ]);

    res.json({
      ok: true,
      note: 'Schema metadata only; no row data or secrets are returned.',
      userSchema,
      financeSchema,
      financeWriteSchema,
      financeWritesEnabled: config.financeWritesEnabled,
    });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'schema_probe_failed', message: error?.message || 'unknown error' });
  }
});

import express from 'express';
import cookieParser from 'cookie-parser';
import { loadConfig } from './config.js';
import { createDb, checkDb } from './db.js';
import { createUserRepository } from './auth/users.js';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { landingPathForRole, requirePanelPage } from './auth/panel-access.js';
import { createFinanceRepository } from './finance/repository.js';
import { createFinanceRouter } from './finance/routes.js';
import { createListingRepository } from './listings/repository.js';
import { createListingRouter } from './listings/routes.js';
import { createNotificationRepository } from './notifications/repository.js';
import { createNotificationRouter } from './notifications/routes.js';
import { createSellerRequestRepository } from './requests/repository.js';
import { createSellerRequestRouter } from './requests/routes.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const users = db ? createUserRepository(db) : null;
const finance = db ? createFinanceRepository(db) : null;
const listings = db ? createListingRepository(db) : null;
const notifications = db ? createNotificationRepository(db) : null;
const sellerRequests = db ? createSellerRequestRepository(db) : null;
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

if (users) {
  app.use(createSessionMiddleware({ users, jwtSecret: config.jwtSecret }));
  app.use('/api', createAuthRouter({
    users,
    jwtSecret: config.jwtSecret,
    production: config.production
  }));

  app.get('/api/access', (req, res) => {
    res.json({
      ok: true,
      authenticated: Boolean(req.user),
      role: req.user?.role || null,
      landingPath: req.user ? landingPathForRole(req.user.role) : '/login.html'
    });
  });

  app.get('/admin.html', requirePanelPage('admin'), (_req, _res, next) => next());
  app.get('/trader.html', requirePanelPage('trader'), (_req, _res, next) => next());
  app.get('/dashboard.html', requirePanelPage('user'), (_req, _res, next) => next());
}

if (finance) {
  app.use('/api', createFinanceRouter({
    finance,
    normalRate: config.normalCommissionRate,
    traderRate: config.traderCommissionRate
  }));
}

if (listings) {
  app.use('/api', createListingRouter({ listings }));
}

if (notifications) {
  app.use('/api', createNotificationRouter({ notifications }));
}

if (sellerRequests && listings && notifications) {
  app.use('/api', createSellerRequestRouter({
    requests: sellerRequests,
    listings,
    notifications
  }));
}

app.get('/api/health', async (_req, res) => {
  const database = await checkDb(db);
  let authSchema = { ok: false, reason: 'database_not_ready' };

  if (database.ok && users) {
    try {
      authSchema = { ok: true, schema: await users.describeSchema() };
    } catch (error) {
      authSchema = { ok: false, reason: String(error?.message || 'auth_schema_error') };
    }
  }

  const migrationGateOk = !config.production || config.sourceBaselineReady;
  const ok = database.ok && authSchema.ok && migrationGateOk;

  res.status(ok ? 200 : 503).json({
    ok,
    app: 'KOTAKAS',
    phase: 21,
    source: 'github-baseline',
    database: database.ok ? 'ok' : 'error',
    authSchema: authSchema.ok ? 'compatible' : authSchema.reason,
    migrationGate: migrationGateOk ? 'open' : 'closed'
  });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    ok: true,
    app: 'KOTAKAS',
    phase: 21,
    normalCommissionRate: config.normalCommissionRate,
    traderCommissionRate: config.traderCommissionRate,
    freeFormChatEnabled: false
  });
});

app.use(express.static('public', {
  extensions: ['html'],
  index: 'index.html',
  maxAge: config.production ? '5m' : 0
}));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  return res.status(404).send('KOTAKAS kaynak geçişi hazırlanıyor.');
});

app.use((error, _req, res, _next) => {
  console.error('[KOTAKAS] request error', error);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[KOTAKAS] Phase 21 source baseline listening on :${config.port}`);
});

async function shutdown(signal) {
  console.log(`[KOTAKAS] ${signal} received, shutting down`);
  server.close(async () => {
    if (db) await db.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import express from 'express';
import cookieParser from 'cookie-parser';
import { loadConfig } from './config.js';
import { createDb, checkDb } from './db.js';
import { createUserRepository } from './auth/users.js';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createGoogleAuthRouter } from './auth/google.js';
import { landingPathForRole, requirePanelPage } from './auth/panel-access.js';
import { createFinanceRepository } from './finance/repository.js';
import { createFinanceRouter } from './finance/routes.js';
import { createEscrowRepository } from './finance/escrow.js';
import { createListingRepository } from './listings/repository.js';
import { createListingRouter } from './listings/routes.js';
import { createNotificationRepository } from './notifications/repository.js';
import { createNotificationRouter } from './notifications/routes.js';
import { createSellerRequestRepository } from './requests/repository.js';
import { createSellerRequestRouter } from './requests/routes.js';
import { createMarketRateRepository } from './market-rates/repository.js';
import { createMarketRateRouter } from './market-rates/routes.js';
import { createDealRepository } from './deals/repository.js';
import { createDealRouter } from './deals/routes.js';
import { createAdminRouter } from './admin/routes.js';
import { createTradeJournalRepository } from './trade-journal/repository.js';
import { createTradeJournalRouter } from './trade-journal/routes.js';

const RELEASE = '22.0.0';
const config = loadConfig();
const db = createDb(config.databaseUrl);
const users = db ? createUserRepository(db) : null;
const finance = db ? createFinanceRepository(db) : null;
const escrow = db ? createEscrowRepository(db) : null;
const listings = db ? createListingRepository(db) : null;
const notifications = db ? createNotificationRepository(db) : null;
const sellerRequests = db ? createSellerRequestRepository(db) : null;
const marketRates = db ? createMarketRateRepository(db) : null;
const deals = db ? createDealRepository(db) : null;
const tradeJournal = db ? createTradeJournalRepository(db) : null;
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
  app.use('/api', createAuthRouter({ users, jwtSecret: config.jwtSecret, production: config.production }));
  app.use(createGoogleAuthRouter({ users, config }));
  app.get('/api/access', (req, res) => res.json({ ok: true, authenticated: Boolean(req.user), role: req.user?.role || null, landingPath: req.user ? landingPathForRole(req.user.role) : '/login.html' }));
  app.get('/admin.html', requirePanelPage('admin'), (_req, _res, next) => next());
  app.get('/trader.html', requirePanelPage('trader'), (_req, _res, next) => next());
  app.get('/dashboard.html', requirePanelPage('user'), (_req, _res, next) => next());
}

if (finance) app.use('/api', createFinanceRouter({ finance, normalRate: config.normalCommissionRate, traderRate: config.traderCommissionRate }));
if (listings) app.use('/api', createListingRouter({ listings }));
if (notifications) app.use('/api', createNotificationRouter({ notifications }));
if (sellerRequests && listings && notifications) app.use('/api', createSellerRequestRouter({ requests: sellerRequests, listings, notifications }));
if (marketRates) app.use('/api', createMarketRateRouter({ marketRates }));
if (deals && listings && marketRates && escrow && notifications) app.use('/api', createDealRouter({ deals, listings, marketRates, escrow, notifications, normalRate: config.normalCommissionRate, traderRate: config.traderCommissionRate }));
if (db && deals && escrow && notifications) app.use('/api', createAdminRouter({ pool: db, deals, escrow, notifications, normalRate: config.normalCommissionRate, traderRate: config.traderCommissionRate }));
if (tradeJournal) app.use('/api', createTradeJournalRouter({ tradeJournal }));

app.get('/api/health', async (_req, res) => {
  const database = await checkDb(db);
  let authSchema = { ok: false, reason: 'database_not_ready' };
  if (database.ok && users) {
    try { authSchema = { ok: true, schema: await users.describeSchema() }; }
    catch (error) { authSchema = { ok: false, reason: String(error?.message || 'auth_schema_error') }; }
  }
  const migrationGateOk = !config.production || config.sourceBaselineReady;
  const ok = database.ok && authSchema.ok && migrationGateOk;
  res.status(ok ? 200 : 503).json({ ok, app: 'KOTAKAS', phase: 22, release: RELEASE, source: 'github', database: database.ok ? 'ok' : 'error', authSchema: authSchema.ok ? 'compatible' : authSchema.reason, migrationGate: migrationGateOk ? 'open' : 'closed' });
});

app.get('/api/meta', (_req, res) => res.json({ ok: true, app: 'KOTAKAS', phase: 22, release: RELEASE, operatingModel: 'gb-journal-first', tradeJournalEnabled: true, normalCommissionRate: config.normalCommissionRate, traderCommissionRate: config.traderCommissionRate, freeFormChatEnabled: false, escrowEnabled: true, googleLoginEnabled: Boolean(config.googleClientId && config.googleClientSecret) }));
app.get('/api/stats', async (_req,res,next)=>{try{const [l,d]=await Promise.all([db.query(`select count(*)::int c from listings where status='active'`),db.query(`select count(*)::int c from deals where status='completed'`)]);res.json({ok:true,activeListings:l.rows[0].c,completedDeals:d.rows[0].c});}catch(e){next(e);}});
app.get('/admin-access.html', (_req,res)=>res.redirect(302,'/admin.html'));

app.use(express.static('public', { extensions: ['html'], index: 'index.html', maxAge: config.production ? '5m' : 0 }));
app.use((req, res) => req.path.startsWith('/api/') ? res.status(404).json({ ok: false, error: 'not_found' }) : res.status(404).send('Sayfa bulunamadı.'));
app.use((error, _req, res, _next) => { console.error('[KOTAKAS] request error', error); if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal_error' }); });

const server = app.listen(config.port, '0.0.0.0', () => console.log(`[KOTAKAS] ${RELEASE} listening on :${config.port}`));
async function shutdown(signal){console.log(`[KOTAKAS] ${signal}`);server.close(async()=>{if(db)await db.end().catch(()=>{});process.exit(0);});}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));

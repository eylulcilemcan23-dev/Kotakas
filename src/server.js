import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { pingDatabase } from './db.js';
import { apiRouter } from './api.js';
import { authRouter } from './auth.js';
import { accountRouter } from './account.js';
import { googleAuthRouter } from './google-auth.js';
import { authStatusRouter } from './auth-status.js';
import { financeStatusRouter } from './finance-status.js';
import { escrowApiRouter } from './escrow-api.js';
import { walletApiRouter } from './wallet-api.js';
import { paymentsApiRouter } from './payments-api.js';
import { marketplaceApiRouter } from './marketplace-api.js';
import { itemCatalogRouter } from './item-catalog-api.js';
import { listingDetailRouter } from './listing-detail-api.js';
import { offersApiRouter } from './offers-api.js';
import { listingQuestionsRouter } from './listing-questions-api.js';
import { swapsApiRouter } from './swaps-api.js';
import { traderDashboardRouter } from './trader-dashboard-api.js';
import { traderAnalyticsRouter } from './trader-analytics-api.js';
import { adminFinanceApiRouter } from './admin-finance-api.js';
import { adminWalletApiRouter } from './admin-wallet-api.js';
import { disputesApiRouter } from './disputes-api.js';
import { disputeCommunicationsRouter } from './dispute-communications.js';
import { notificationPreferencesRouter } from './notification-preferences-api.js';
import { optionalSession } from './session.js';
import { configureRealtime } from './realtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: false },
  serveClient: true,
});

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(optionalSession);

app.get('/api/health', async (_req, res) => {
  try {
    const db = await pingDatabase();
    res.status(200).json({ ok: true, service: 'kotakas', sourceMode: true, db, nodeEnv: config.nodeEnv, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'kotakas', sourceMode: true, db: { ok: false, error: error?.message || 'database error' }, timestamp: new Date().toISOString() });
  }
});

app.use('/api', authRouter);
app.use('/api', accountRouter);
app.use('/', googleAuthRouter);
app.use('/api', authStatusRouter);
app.use('/api', financeStatusRouter);
app.use('/api', escrowApiRouter);
app.use('/api', walletApiRouter);
app.use('/api', paymentsApiRouter);
app.use('/api', marketplaceApiRouter);
app.use('/api', itemCatalogRouter);
app.use('/api', listingDetailRouter);
app.use('/api', offersApiRouter);
app.use('/api', listingQuestionsRouter);
app.use('/api', swapsApiRouter);
app.use('/api', traderDashboardRouter);
app.use('/api', traderAnalyticsRouter);
app.use('/api', adminFinanceApiRouter);
app.use('/api', adminWalletApiRouter);
app.use('/api', disputesApiRouter);
app.use('/api', disputeCommunicationsRouter);
app.use('/api', notificationPreferencesRouter);
app.use('/api', apiRouter);
app.use(express.static(publicDir));

configureRealtime(io);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not_found' });
  next();
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[KOTAKAS] source-migration listening on 0.0.0.0:${config.port}`);
});

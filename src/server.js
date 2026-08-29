import express from 'express';
import { loadConfig } from './config.js';
import { createDb, checkDb } from './db.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', async (_req, res) => {
  const database = await checkDb(db);
  const migrationGateOk = !config.production || config.sourceBaselineReady;
  const ok = database.ok && migrationGateOk;

  res.status(ok ? 200 : 503).json({
    ok,
    app: 'KOTAKAS',
    phase: 21,
    source: 'github-baseline',
    database: database.ok ? 'ok' : 'error',
    migrationGate: migrationGateOk ? 'open' : 'closed'
  });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    ok: true,
    app: 'KOTAKAS',
    phase: 21,
    normalCommissionRate: config.normalCommissionRate,
    traderCommissionRate: config.traderCommissionRate
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

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { pingDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: false },
});

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(publicDir));

app.get('/api/health', async (_req, res) => {
  try {
    const db = await pingDatabase();
    res.status(200).json({
      ok: true,
      service: 'kotakas',
      sourceMode: true,
      db,
      nodeEnv: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'kotakas',
      sourceMode: true,
      db: { ok: false, error: error?.message || 'database error' },
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/migration-status', (_req, res) => {
  res.json({
    phase: 'source-migration',
    productionUntouched: true,
    next: ['frontend snapshot', 'auth compatibility', 'admin roles', 'wallet/commission'],
  });
});

io.on('connection', (socket) => {
  socket.emit('system:hello', { ok: true, service: 'kotakas' });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  next();
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[KOTAKAS] source-migration listening on 0.0.0.0:${config.port}`);
});

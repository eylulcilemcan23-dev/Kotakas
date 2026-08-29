import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const errors = [];
const warnings = [];

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
function enabled(name) { return /^(1|true|yes|on)$/i.test(String(process.env[name] || '')); }
function requireEnv(name, message = `${name} tanımlı olmalı`) {
  if (!String(process.env[name] || '').trim()) fail(message);
}
function requireHttps(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) return fail(`${name} tanımlı olmalı`);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(`${name} production için HTTPS olmalı`);
  } catch {
    fail(`${name} geçerli bir URL olmalı`);
  }
}

async function text(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

function parseEnvExample(source) {
  const result = new Map();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    result.set(line.slice(0, index), line.slice(index + 1));
  }
  return result;
}

async function staticChecks() {
  const [envSource, configSource, serverSource, indexSource, previewSource, ciSource] = await Promise.all([
    text('.env.example'), text('src/config.js'), text('src/server.js'), text('public/index.html'),
    text('public/assets/preview-demo.js'), text('.github/workflows/ci.yml'),
  ]);
  const env = parseEnvExample(envSource);
  const criticalFalse = [
    'LEGACY_LOGIN_ENABLED', 'USER_WRITES_ENABLED', 'REGISTRATION_ENABLED', 'PASSWORD_RESET_ENABLED',
    'SUPPORT_WRITES_ENABLED', 'FINANCE_WRITES_ENABLED', 'PAYMENT_WRITES_ENABLED', 'WITHDRAWAL_WRITES_ENABLED',
    'ESCROW_API_ENABLED', 'DIRECT_ESCROW_ENABLED', 'MARKET_WRITES_ENABLED', 'SWAP_WRITES_ENABLED',
    'DISPUTE_WRITES_ENABLED', 'COMMUNICATION_WRITES_ENABLED', 'AUDIT_LOG_ENABLED', 'GOOGLE_AUTO_REGISTER_ENABLED',
  ];
  for (const name of criticalFalse) {
    if (String(env.get(name) || '').toLowerCase() !== 'false') fail(`.env.example güvenli varsayılanı bozulmuş: ${name}=false olmalı`);
  }
  if (env.get('PAYMENT_PROVIDER') !== 'disabled') fail('PAYMENT_PROVIDER varsayılanı disabled olmalı');
  if (String(env.get('PAYTR_TEST_MODE') || '').toLowerCase() !== 'true') fail('PAYTR_TEST_MODE örnek ortamda true kalmalı');

  const migrations = (await fs.readdir(path.join(root, 'migrations')))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  const expected = Array.from({ length: 12 }, (_, index) => String(index + 2).padStart(3, '0'));
  const actual = migrations.map((name) => name.slice(0, 3));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`Migration sırası 002-013 kesintisiz olmalı; bulunan: ${actual.join(', ')}`);
  }

  if (!serverSource.includes("app.disable('x-powered-by')")) fail('Express x-powered-by kapatma koruması bulunamadı');
  if (!serverSource.includes('helmet(')) fail('Helmet güvenlik middleware bulunamadı');
  if (!serverSource.includes("express.json({ limit: '1mb' })")) warn('JSON body limiti 1mb olarak doğrulanamadı');
  if (!configSource.includes("envFlag('MARKET_WRITES_ENABLED', false)")) fail('MARKET_WRITES_ENABLED güvenli false varsayılanı config içinde bulunamadı');
  if (!configSource.includes("envFlag('PAYMENT_WRITES_ENABLED', false)")) fail('PAYMENT_WRITES_ENABLED güvenli false varsayılanı config içinde bulunamadı');
  if (!configSource.includes('withdrawalProviderReady')) fail('Para çekme sağlayıcı hazır olma koruması bulunamadı');

  const demoIndex = indexSource.indexOf('/assets/preview-demo.js');
  const appIndex = indexSource.indexOf('/assets/app.js');
  if (demoIndex < 0 || appIndex < 0 || demoIndex > appIndex) fail('Preview demo interceptörü app.js öncesinde yüklenmeli');
  if (!previewSource.includes("hostname.endsWith('.vercel.app')")) fail('Preview demo yalnız .vercel.app üzerinde çalışacak şekilde sınırlandırılmamış');
  if (!indexSource.includes('/assets/faz20-ui-polish.js')) fail('Faz 20 UI düzeltme katmanı index.html içinde bulunamadı');

  for (const marker of ['Staging migration rehearsal', 'Source smoke test']) {
    if (!ciSource.includes(marker)) fail(`CI adımı bulunamadı: ${marker}`);
  }
}

function productionChecks() {
  if (process.env.KOTAKAS_RELEASE_MODE !== 'production') {
    warn('Production credential kontrolleri çalıştırılmadı; KOTAKAS_RELEASE_MODE=production ile cutover öncesi ayrıca çalıştırılmalı');
    return;
  }

  if (process.env.NODE_ENV !== 'production') fail('NODE_ENV=production olmalı');
  requireEnv('DATABASE_URL');
  if (String(process.env.JWT_SECRET || '').length < 32) fail('JWT_SECRET en az 32 karakter olmalı');
  requireHttps('APP_PUBLIC_BASE_URL');

  if (process.env.KOTAKAS_BACKUP_CONFIRMED !== '1') fail('Production DB yedeği doğrulanmadan release hazır sayılamaz: KOTAKAS_BACKUP_CONFIRMED=1');
  requireEnv('KOTAKAS_ROLLBACK_DEPLOYMENT_ID', 'Rollback deployment ID kayıt altına alınmalı');

  if (enabled('REGISTRATION_ENABLED') && !enabled('USER_WRITES_ENABLED')) fail('REGISTRATION_ENABLED için USER_WRITES_ENABLED=true gerekli');
  if (enabled('PASSWORD_RESET_ENABLED')) {
    if (!enabled('USER_WRITES_ENABLED')) fail('PASSWORD_RESET_ENABLED için USER_WRITES_ENABLED=true gerekli');
    if (String(process.env.PASSWORD_RESET_SECRET || '').length < 32) fail('PASSWORD_RESET_SECRET en az 32 karakter olmalı');
    if (process.env.EMAIL_PROVIDER !== 'resend') fail('Şifre sıfırlama yayındaysa EMAIL_PROVIDER=resend olmalı');
    requireEnv('EMAIL_API_KEY');
    requireEnv('EMAIL_FROM');
  }

  const googleValues = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'].map((name) => String(process.env[name] || '').trim());
  const someGoogle = googleValues.some(Boolean);
  const allGoogle = googleValues.every(Boolean);
  if (someGoogle && !allGoogle) fail('Google OAuth credential seti kısmi bırakılamaz');
  if (allGoogle && !String(process.env.GOOGLE_CALLBACK_URL).startsWith('https://')) fail('GOOGLE_CALLBACK_URL production için HTTPS olmalı');

  if (enabled('MARKET_WRITES_ENABLED')) {
    if (!enabled('FINANCE_WRITES_ENABLED')) fail('MARKET_WRITES_ENABLED için FINANCE_WRITES_ENABLED=true gerekli');
    if (!enabled('ESCROW_API_ENABLED')) fail('MARKET_WRITES_ENABLED için ESCROW_API_ENABLED=true gerekli');
    if (!Object.prototype.hasOwnProperty.call(process.env, 'TRADER_COMMISSION_RATE')) {
      fail('Pazarcı komisyon oranı yayın öncesi açıkça seçilmeli: TRADER_COMMISSION_RATE');
    } else {
      const rate = Number(process.env.TRADER_COMMISSION_RATE);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 0.5) fail('TRADER_COMMISSION_RATE 0 ile 0.5 arasında pozitif olmalı');
    }
  }
  if (enabled('SWAP_WRITES_ENABLED') && !enabled('MARKET_WRITES_ENABLED')) fail('SWAP_WRITES_ENABLED için MARKET_WRITES_ENABLED=true gerekli');

  if (enabled('PAYMENT_WRITES_ENABLED')) {
    if (process.env.PAYMENT_PROVIDER !== 'paytr') fail('PAYMENT_WRITES_ENABLED için PAYMENT_PROVIDER=paytr gerekli');
    requireEnv('PAYTR_MERCHANT_ID');
    requireEnv('PAYTR_MERCHANT_KEY');
    requireEnv('PAYTR_MERCHANT_SALT');
    requireHttps('PAYMENT_PUBLIC_BASE_URL');
    if (enabled('PAYTR_TEST_MODE')) fail('Canlı ödeme açılırken PAYTR_TEST_MODE=false olmalı');
  }

  if (enabled('WITHDRAWAL_WRITES_ENABLED')) {
    fail('WITHDRAWAL_WRITES_ENABLED şu an açılamaz; doğrulanmış payout/Platform Transfer adapteri henüz yok');
  }
}

await staticChecks();
productionChecks();

for (const item of warnings) console.warn(`[readiness][WARN] ${item}`);
if (errors.length) {
  for (const item of errors) console.error(`[readiness][FAIL] ${item}`);
  console.error(`[readiness] FAIL (${errors.length} blocker)`);
  process.exitCode = 1;
} else {
  console.log(`[readiness] PASS (${warnings.length} warning)`);
}

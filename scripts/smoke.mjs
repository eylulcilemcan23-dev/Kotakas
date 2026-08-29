const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const checks = ['/', '/login.html', '/api/health', '/api/meta', '/api/me', '/api/listings', '/api/market-rates', '/api/requests/options'];
let failed = false;
for (const path of checks) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'manual' });
    const body = await response.text();
    console.log(`${path} -> ${response.status} ${body.slice(0, 220).replace(/\s+/g,' ')}`);
    if (response.status < 200 || response.status >= 400) failed = true;
  } catch (error) { failed = true; console.error(`${path} -> ERROR`, error.message); }
}
if (failed) process.exit(1);
console.log('KOTAKAS smoke checks passed.');

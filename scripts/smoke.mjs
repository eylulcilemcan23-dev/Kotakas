const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const checks = ['/api/health', '/api/meta'];
let failed = false;

for (const path of checks) {
  try {
    const response = await fetch(`${base}${path}`);
    const body = await response.text();
    console.log(`${path} -> ${response.status} ${body.slice(0, 300)}`);
    if (!response.ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`${path} -> ERROR`, error.message);
  }
}

if (failed) process.exit(1);
console.log('KOTAKAS smoke checks passed.');

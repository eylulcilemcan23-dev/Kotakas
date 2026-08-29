import pg from 'pg';
import bcrypt from 'bcryptjs';
import { createUserRepository } from '../src/auth/users.js';

const { Pool } = pg;
const email = String(process.env.KOTAKAS_SEED_USER_EMAIL || '').trim().toLowerCase();
const password = String(process.env.KOTAKAS_SEED_USER_PASSWORD || '');
const displayName = String(process.env.KOTAKAS_SEED_USER_NAME || 'KOTAKAS Üye').trim();

if (!email || !password) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'seed_variables_missing' }));
  process.exit(0);
}

if (password.length < 8) throw new Error('seed_password_too_short');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

try {
  const users = createUserRepository(pool);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await users.findAuthUserByEmail(email);

  if (existing?.user) {
    await users.upgradePasswordHash(existing.user.id, passwordHash);
    console.log(JSON.stringify({ ok: true, action: 'password_reset', userId: existing.user.id, email }));
  } else {
    const user = await users.createUser({ email, passwordHash, displayName, role: 'user' });
    console.log(JSON.stringify({ ok: true, action: 'created', userId: user.id, email }));
  }
} finally {
  await pool.end();
}

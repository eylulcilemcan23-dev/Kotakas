const TABLE_CANDIDATES = ['users', 'app_users', 'members'];

const COLUMN_ALIASES = Object.freeze({
  id: ['id', 'user_id'],
  email: ['email', 'mail'],
  passwordHash: ['password_hash', 'pass_hash', 'password'],
  displayName: ['display_name', 'full_name', 'name', 'username'],
  role: ['role', 'user_role'],
  active: ['is_active', 'active'],
  status: ['status', 'account_status'],
  createdAt: ['created_at', 'created'],
  updatedAt: ['updated_at', 'updated'],
  lastLoginAt: ['last_login_at', 'last_login']
});

function quoteIdent(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error('invalid_sql_identifier');
  return `"${value}"`;
}

function pick(columns, aliases) {
  return aliases.find((name) => columns.has(name)) || null;
}

function normalizeRole(row, schema) {
  if (schema.role && row[schema.role]) return String(row[schema.role]);
  if (row.is_admin === true) return 'admin_full';
  if (row.is_trader === true || row.trader_verified === true) return 'trader';
  return 'user';
}

function normalizeActive(row, schema) {
  if (schema.active) return row[schema.active] !== false;
  if (schema.status) {
    const status = String(row[schema.status] || '').toLowerCase();
    if (['blocked', 'banned', 'disabled', 'inactive', 'deleted'].includes(status)) return false;
  }
  return true;
}

function publicUser(row, schema) {
  if (!row) return null;
  return {
    id: schema.id ? row[schema.id] : null,
    email: schema.email ? row[schema.email] : null,
    displayName: schema.displayName ? row[schema.displayName] : null,
    role: normalizeRole(row, schema),
    active: normalizeActive(row, schema),
    createdAt: schema.createdAt ? row[schema.createdAt] : null
  };
}

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function validateRegistrationInput({ email, password, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(displayName || '').trim();
  const normalizedPassword = String(password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (normalizedPassword.length < 8 || normalizedPassword.length > 128) {
    return { ok: false, error: 'invalid_password_length' };
  }
  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return { ok: false, error: 'invalid_display_name' };
  }

  return {
    ok: true,
    value: { email: normalizedEmail, password: normalizedPassword, displayName: normalizedName }
  };
}

export async function discoverUserSchema(pool) {
  const tablesResult = await pool.query(
    `select table_name
       from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'`
  );
  const availableTables = new Set(tablesResult.rows.map((row) => row.table_name));
  const table = TABLE_CANDIDATES.find((name) => availableTables.has(name));
  if (!table) throw new Error('users_table_not_found');

  const columnsResult = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema='public' and table_name=$1`,
    [table]
  );
  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  const schema = { table, columns };
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    schema[key] = pick(columns, aliases);
  }

  if (!schema.id || !schema.email || !schema.passwordHash) {
    throw new Error(`users_schema_incompatible:${table}`);
  }
  return schema;
}

export function createUserRepository(pool) {
  let schemaPromise;
  const getSchema = () => (schemaPromise ||= discoverUserSchema(pool));

  return {
    async describeSchema() {
      const schema = await getSchema();
      return {
        table: schema.table,
        id: schema.id,
        email: schema.email,
        passwordHash: schema.passwordHash,
        displayName: schema.displayName,
        role: schema.role,
        active: schema.active,
        status: schema.status,
        lastLoginAt: schema.lastLoginAt
      };
    },

    async findAuthUserByEmail(email) {
      const schema = await getSchema();
      const result = await pool.query(
        `select * from ${quoteIdent(schema.table)} where lower(${quoteIdent(schema.email)})=lower($1) limit 1`,
        [normalizeEmail(email)]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        user: publicUser(row, schema),
        passwordHash: row[schema.passwordHash]
      };
    },

    async findPublicUserById(id) {
      const schema = await getSchema();
      const result = await pool.query(
        `select * from ${quoteIdent(schema.table)} where ${quoteIdent(schema.id)}=$1 limit 1`,
        [id]
      );
      return publicUser(result.rows[0], schema);
    },

    async createUser({ email, passwordHash, displayName, role = 'user' }) {
      const schema = await getSchema();
      const columns = [schema.email, schema.passwordHash];
      const values = [normalizeEmail(email), passwordHash];

      if (schema.displayName) {
        columns.push(schema.displayName);
        values.push(displayName);
      }
      if (schema.role) {
        columns.push(schema.role);
        values.push(role);
      }
      if (schema.active) {
        columns.push(schema.active);
        values.push(true);
      }

      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      const result = await pool.query(
        `insert into ${quoteIdent(schema.table)} (${columns.map(quoteIdent).join(', ')})
         values (${placeholders}) returning *`,
        values
      );
      return publicUser(result.rows[0], schema);
    },

    async touchLastLogin(id) {
      const schema = await getSchema();
      if (!schema.lastLoginAt) return;
      await pool.query(
        `update ${quoteIdent(schema.table)} set ${quoteIdent(schema.lastLoginAt)}=now() where ${quoteIdent(schema.id)}=$1`,
        [id]
      );
    }
  };
}

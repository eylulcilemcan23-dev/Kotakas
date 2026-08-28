function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtSecretPresent: Boolean(process.env.JWT_SECRET),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'kotakas_session',
  sessionTtl: process.env.SESSION_TTL || '7d',
  sessionCookieMaxAgeMs: Number(process.env.SESSION_COOKIE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
  legacyLoginEnabled: envFlag('LEGACY_LOGIN_ENABLED', false),
  financeWritesEnabled: envFlag('FINANCE_WRITES_ENABLED', false),
  commissionRate: Number(process.env.COMMISSION_RATE || 0),
  traderDebtLimitGb: Number(process.env.TRADER_DEBT_LIMIT_GB || 0),
  googleClientIdPresent: Boolean(process.env.GOOGLE_CLIENT_ID),
  googleClientSecretPresent: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
};

config.googleOAuthReady = Boolean(
  config.googleClientIdPresent &&
  config.googleClientSecretPresent &&
  config.googleCallbackUrl,
);

export const isProduction = config.nodeEnv === 'production';

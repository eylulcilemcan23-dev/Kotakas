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
  userWritesEnabled: envFlag('USER_WRITES_ENABLED', false),
  registrationEnabled: envFlag('REGISTRATION_ENABLED', false),
  passwordResetEnabled: envFlag('PASSWORD_RESET_ENABLED', false),
  passwordResetSecret: process.env.PASSWORD_RESET_SECRET || '',
  passwordResetTtl: process.env.PASSWORD_RESET_TTL || '30m',
  passwordResetDeliveryEnabled: false,
  financeWritesEnabled: envFlag('FINANCE_WRITES_ENABLED', false),
  escrowApiEnabled: envFlag('ESCROW_API_ENABLED', false),
  directEscrowEnabled: envFlag('DIRECT_ESCROW_ENABLED', false),
  marketWritesEnabled: envFlag('MARKET_WRITES_ENABLED', false),
  disputeWritesEnabled: envFlag('DISPUTE_WRITES_ENABLED', false),
  communicationWritesEnabled: envFlag('COMMUNICATION_WRITES_ENABLED', false),
  auditLogEnabled: envFlag('AUDIT_LOG_ENABLED', false),
  commissionRate: Number(process.env.COMMISSION_RATE || 0),
  traderDebtLimitGb: Number(process.env.TRADER_DEBT_LIMIT_GB || 0),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
  googleAutoRegisterEnabled: envFlag('GOOGLE_AUTO_REGISTER_ENABLED', false),
  googleStateCookieName: process.env.GOOGLE_STATE_COOKIE_NAME || 'kotakas_google_oauth_state',
};

config.googleClientIdPresent = Boolean(config.googleClientId);
config.googleClientSecretPresent = Boolean(config.googleClientSecret);
config.googleOAuthReady = Boolean(
  config.googleClientId &&
  config.googleClientSecret &&
  config.googleCallbackUrl,
);

export const isProduction = config.nodeEnv === 'production';

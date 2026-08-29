const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET'];

export function loadConfig() {
  const env = process.env.NODE_ENV || 'development';
  const production = env === 'production';

  if (production) {
    const missing = requiredInProduction.filter((key) => !process.env[key]);
    if (missing.length) {
      throw new Error(`Missing production variables: ${missing.join(', ')}`);
    }
  }

  const publicBaseUrl = process.env.APP_PUBLIC_BASE_URL || 'http://localhost:3000';

  return Object.freeze({
    env,
    production,
    port: Number(process.env.PORT || 3000),
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    publicBaseUrl,
    normalCommissionRate: Number(process.env.COMMISSION_RATE || 4),
    traderCommissionRate: Number(process.env.TRADER_COMMISSION_RATE || 3),
    traderDebtLimitGb: Number(process.env.TRADER_DEBT_LIMIT_GB || 0),
    sourceBaselineReady: process.env.KOTAKAS_SOURCE_BASELINE_READY === 'true',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || `${publicBaseUrl}/auth/google/callback`
  });
}

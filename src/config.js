export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecretPresent: Boolean(process.env.JWT_SECRET),
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

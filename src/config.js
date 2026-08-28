export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecretPresent: Boolean(process.env.JWT_SECRET),
  commissionRate: Number(process.env.COMMISSION_RATE || 0),
  traderDebtLimitGb: Number(process.env.TRADER_DEBT_LIMIT_GB || 0),
};

export const isProduction = config.nodeEnv === 'production';

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function envNumber(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const nodeEnv = process.env.NODE_ENV || 'development';
const paymentProvider = String(process.env.PAYMENT_PROVIDER || 'disabled').trim().toLowerCase();
const paymentPublicBaseUrl = String(process.env.PAYMENT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const emailProvider = String(process.env.EMAIL_PROVIDER || 'disabled').trim().toLowerCase();
const appPublicBaseUrl = String(process.env.APP_PUBLIC_BASE_URL || process.env.PAYMENT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv,
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
  emailProvider,
  emailApiKey: process.env.EMAIL_API_KEY || '',
  emailFrom: String(process.env.EMAIL_FROM || '').trim(),
  appPublicBaseUrl,
  supportWritesEnabled: envFlag('SUPPORT_WRITES_ENABLED', false),
  financeWritesEnabled: envFlag('FINANCE_WRITES_ENABLED', false),
  paymentWritesEnabled: envFlag('PAYMENT_WRITES_ENABLED', false),
  withdrawalWritesEnabled: envFlag('WITHDRAWAL_WRITES_ENABLED', false),
  paymentProvider,
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
  paymentPublicBaseUrl,
  depositMinAmount: envNumber('DEPOSIT_MIN_AMOUNT', 50, { min: 1, max: 1_000_000 }),
  depositMaxAmount: envNumber('DEPOSIT_MAX_AMOUNT', 50_000, { min: 1, max: 1_000_000 }),
  withdrawalMinAmount: envNumber('WITHDRAWAL_MIN_AMOUNT', 100, { min: 1, max: 1_000_000 }),
  withdrawalMaxAmount: envNumber('WITHDRAWAL_MAX_AMOUNT', 100_000, { min: 1, max: 1_000_000 }),
  withdrawalFeeRate: envNumber('WITHDRAWAL_FEE_RATE', 0, { min: 0, max: 0.5 }),
  paytrMerchantId: String(process.env.PAYTR_MERCHANT_ID || '').trim(),
  paytrMerchantKey: process.env.PAYTR_MERCHANT_KEY || '',
  paytrMerchantSalt: process.env.PAYTR_MERCHANT_SALT || '',
  paytrTestMode: envFlag('PAYTR_TEST_MODE', true),
  paytrDebugOn: envFlag('PAYTR_DEBUG_ON', nodeEnv !== 'production'),
  paytrNoInstallment: envFlag('PAYTR_NO_INSTALLMENT', true),
  paytrMaxInstallment: envNumber('PAYTR_MAX_INSTALLMENT', 0, { min: 0, max: 12 }),
  paytrTimeoutMinutes: envNumber('PAYTR_TIMEOUT_MINUTES', 30, { min: 5, max: 60 }),
  escrowApiEnabled: envFlag('ESCROW_API_ENABLED', false),
  directEscrowEnabled: envFlag('DIRECT_ESCROW_ENABLED', false),
  marketWritesEnabled: envFlag('MARKET_WRITES_ENABLED', false),
  swapWritesEnabled: envFlag('SWAP_WRITES_ENABLED', false),
  disputeWritesEnabled: envFlag('DISPUTE_WRITES_ENABLED', false),
  communicationWritesEnabled: envFlag('COMMUNICATION_WRITES_ENABLED', false),
  auditLogEnabled: envFlag('AUDIT_LOG_ENABLED', false),
  commissionRate: Number(process.env.COMMISSION_RATE || 0),
  traderCommissionRate: Number(process.env.TRADER_COMMISSION_RATE ?? process.env.COMMISSION_RATE ?? 0),
  normalUserMonthlyListingLimit: Number(process.env.NORMAL_USER_MONTHLY_LISTING_LIMIT || 1),
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

function publicUrlSafe(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && (config.nodeEnv !== 'production' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

config.emailDeliveryReady = Boolean(
  config.emailProvider === 'resend' &&
  config.emailApiKey &&
  config.emailFrom &&
  publicUrlSafe(config.appPublicBaseUrl),
);
config.passwordResetDeliveryEnabled = config.emailDeliveryReady;

const paytrCredentialsPresent = Boolean(
  config.paytrMerchantId &&
  config.paytrMerchantKey &&
  config.paytrMerchantSalt,
);
const productionPaymentUrlSafe = publicUrlSafe(config.paymentPublicBaseUrl);

config.paymentProviderConfigured = config.paymentProvider === 'paytr'
  ? paytrCredentialsPresent
  : Boolean(
      config.paymentProvider &&
      config.paymentProvider !== 'disabled' &&
      config.paymentWebhookSecret &&
      config.paymentWebhookSecret.length >= 16,
    );
config.paymentCheckoutReady = Boolean(
  config.paymentProvider === 'paytr' &&
  paytrCredentialsPresent &&
  productionPaymentUrlSafe,
);
config.paytrCallbackUrl = config.paymentCheckoutReady
  ? `${config.paymentPublicBaseUrl}/api/payments/paytr/callback`
  : '';
// PayTR standart iFrame ürünü genel cüzdan nakit çekimi için kullanılmaz.
// Satıcı/pazarcı payout akışı Marketplace/Platform Transfer sözleşmesi doğrulanınca ayrı adapterle açılacaktır.
config.withdrawalProviderReady = config.paymentProvider !== 'paytr' && config.paymentProvider !== 'disabled';

export const isProduction = config.nodeEnv === 'production';

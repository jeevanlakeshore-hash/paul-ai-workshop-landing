import { parsePrice } from './payments.js';

export function readConfig(env = process.env) {
  const startsAt = env.WORKSHOP_STARTS_AT || null;
  if (startsAt && (!/(Z|[+-]\d{2}:\d{2})$/.test(startsAt) || !Number.isFinite(Date.parse(startsAt)))) {
    throw new Error('WORKSHOP_STARTS_AT must be an ISO date with a timezone.');
  }
  function policy(name) {
    const value = env[name] || null;
    if (value && !/^https:\/\//.test(value)) throw new Error(`${name} must be an https URL.`);
    return value;
  }
  const config = {
    amount: parsePrice(env.WORKSHOP_PRICE_INR), startsAt,
    keyId: env.RAZORPAY_KEY_ID || '', keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    venue: env.WORKSHOP_VENUE || 'VPS Lakeshore Hospital',
    supportEmail: env.SUPPORT_EMAIL || 'support@ai-for-doctors.com',
    policies: { terms: policy('TERMS_URL'), privacy: policy('PRIVACY_URL'), refund: policy('REFUND_URL') },
    origin: env.PUBLIC_ORIGIN || 'http://localhost:5173',
    production: env.NODE_ENV === 'production',
    trustProxy: Number(env.TRUST_PROXY_HOPS || 0),
  };
  config.ready = Boolean(config.amount && config.startsAt && config.keyId && config.keySecret && config.webhookSecret);
  return config;
}

export function publicConfig(config) {
  return {
    amount: config.amount, currency: 'INR', startsAt: config.startsAt,
    venue: config.venue, supportEmail: config.supportEmail, policies: config.policies,
    checkoutEnabled: config.ready && Date.parse(config.startsAt) > Date.now(),
    testMode: config.keyId.startsWith('rzp_test_'),
  };
}

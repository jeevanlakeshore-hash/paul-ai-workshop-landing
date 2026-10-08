import express from 'express';
import { zohoFields, ZOHO_FORM_ACTION } from '../shared/zoho.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { publicConfig } from './config.js';
import { HttpError, validSignature, validateRegistration, tokenHash, assertCaptured } from './payments.js';

export function createApp({ config, store, gateway, staticDir }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    // Razorpay's hosted UI needs inline styles and its own frames.
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https://*.razorpay.com'],
      connectSrc: ["'self'", 'https://*.razorpay.com'], frameSrc: ['https://*.razorpay.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"],
      formAction: ["'self'", new URL(ZOHO_FORM_ACTION).origin],
      upgradeInsecureRequests: config.production ? [] : null,
    } },
    strictTransportSecurity: config.production ? undefined : false,
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), (req, res) => {
    if (!config.webhookSecret) throw new HttpError(503, 'Webhooks are not configured.');
    if (!Buffer.isBuffer(req.body) || !validSignature(req.body, req.get('x-razorpay-signature'), config.webhookSecret)) {
      throw new HttpError(400, 'Invalid webhook signature.');
    }
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid webhook JSON.'); }
    if (!['payment.captured', 'order.paid'].includes(event.event)) return res.json({ received: true });
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) throw new HttpError(400, 'Missing payment entity.');
    const registration = store.byOrder(payment.order_id);
    // Events for other products in the same Razorpay account are intentionally ignored.
    if (!registration) return res.json({ received: true });
    const eventId = createHash('sha256').update(req.body).digest('hex');
    store.processEvent(eventId, () => {
      if (assertCaptured(payment, registration)) store.markPaid(registration.id, payment.id);
    });
    res.json({ received: true });
  });

  app.use('/api', express.json({ limit: '12kb' }));
  app.use('/api', (req, _res, next) => {
    const origin = req.get('origin');
    const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
    if (origin && origin !== config.origin && (config.production || !localOrigins.includes(origin))) {
      throw new HttpError(403, 'This origin is not allowed.');
    }
    next();
  });
  app.get('/api/workshop', (_req, res) => res.json(publicConfig(config)));
  const paymentLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' } });
  app.use('/api/payments', paymentLimiter);
  app.post('/api/payments/orders', rateLimit({ windowMs: 60_000, limit: 5, legacyHeaders: false,
    message: { error: 'Please wait a minute before creating another registration.' } }), async (req, res) => {
    if (!publicConfig(config).checkoutEnabled) throw new HttpError(503, 'Registration payments are not open yet. Please check back soon.');
    const attendee = validateRegistration(req.body);
    attendee.policies = config.policies;
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const order = await gateway.createOrder(config.amount, id);
    if (typeof order.id !== 'string' || order.amount !== config.amount || order.currency !== 'INR') throw new HttpError(502, 'Unexpected payment order. Please contact support.');
    store.insert({ id, token_hash: tokenHash(token), order_id: order.id, amount: config.amount, attendee });
    res.status(201).json({ registrationId: id, token, orderId: order.id, keyId: config.keyId, amount: config.amount, currency: 'INR' });
  });

  function authorize(body) {
    if (typeof body?.registrationId !== 'string' || typeof body?.token !== 'string' || body.token.length !== 64) throw new HttpError(403, 'Invalid registration access.');
    const registration = store.get(body.registrationId);
    if (!registration || registration.token_hash !== tokenHash(body.token)) throw new HttpError(403, 'Invalid registration access.');
    return registration;
  }
  function result(registration) {
    const current = store.get(registration.id);
    return { status: current.status, registrationId: current.id, paymentId: current.payment_id, amount: current.amount, currency: 'INR', zohoFields: zohoFields(current) };
  }
  app.post('/api/payments/verify', async (req, res) => {
    const registration = authorize(req.body);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (razorpay_order_id !== registration.order_id || typeof razorpay_payment_id !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(razorpay_payment_id)
      || !validSignature(`${registration.order_id}|${razorpay_payment_id}`, razorpay_signature, config.keySecret)) {
      throw new HttpError(400, 'Payment verification failed. Contact support if your account was debited.');
    }
    const payment = await gateway.getPayment(razorpay_payment_id);
    if (payment.id !== razorpay_payment_id) throw new HttpError(400, 'Payment identifier mismatch.');
    if (assertCaptured(payment, registration)) store.markPaid(registration.id, payment.id);
    res.json(result(registration));
  });
  app.post('/api/payments/status', async (req, res) => {
    const registration = authorize(req.body);
    if (registration.status !== 'paid') {
      const payments = await gateway.getOrderPayments(registration.order_id);
      for (const payment of payments.items || []) {
        if (assertCaptured(payment, registration)) { store.markPaid(registration.id, payment.id); break; }
      }
    }
    res.json(result(registration));
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found.')));
  if (staticDir) app.use(express.static(staticDir));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(`Request failed (${status}): ${error instanceof HttpError ? error.message : 'Internal server error'}`);
    res.status(status).json({ error: status < 500 || error instanceof HttpError ? error.message : 'Unable to complete this request. Please contact support.' });
  });
  return app;
}

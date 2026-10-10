import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlobStore } from '../server/blob-store.js';
import { createBlobRateLimit } from '../server/blob-rate-limit.js';

function memoryBlobs() {
  const entries = new Map();
  let revision = 0;
  return {
    async get(key) { return structuredClone(entries.get(key)?.data ?? null); },
    async getWithMetadata(key) { return structuredClone(entries.get(key) ?? null); },
    async setJSON(key, data, options = {}) {
      const existing = entries.get(key);
      if ((options.onlyIfNew && existing) || (options.onlyIfMatch && existing?.etag !== options.onlyIfMatch)) return { modified: false };
      entries.set(key, { data: structuredClone(data), etag: String(++revision) });
      return { modified: true, etag: String(revision) };
    },
  };
}

test('captured payment survives fresh function instances and concurrent duplicate callbacks', async () => {
  const blobs = memoryBlobs();
  const first = createBlobStore(blobs);
  const second = createBlobStore(blobs);
  await first.insert({ id: 'registration', order_id: 'order_1', token_hash: 'hash', amount: 250000, attendee: { firstName: 'Doctor' } });
  assert.equal((await second.byOrder('order_1')).status, 'pending');
  await Promise.all([first.markPaid('registration', 'pay_1'), second.markPaid('registration', 'pay_1')]);
  const paid = await createBlobStore(blobs).get('registration');
  assert.equal(paid.status, 'paid');
  assert.equal(paid.payment_id, 'pay_1');
  assert.equal(JSON.parse(paid.attendee).firstName, 'Doctor');
  await assert.rejects(second.markPaid('registration', 'pay_2'), /different payment/);
  assert.equal((await first.get('registration')).payment_id, 'pay_1');
});

test('failed webhook processing remains retryable and concurrent retries preserve payment', async () => {
  const blobs = memoryBlobs();
  const store = createBlobStore(blobs);
  await assert.rejects(store.processEvent('event', () => { throw new Error('storage failure'); }), /storage failure/);
  assert.equal(await blobs.get('events/event'), null);
  await Promise.all([store.processEvent('event', () => store.markPaid('registration', 'pay_1')), store.processEvent('event', () => store.markPaid('registration', 'pay_1'))]);
  assert.ok(await blobs.get('events/event'));
  let processedAgain = false;
  await store.processEvent('event', () => { processedAgain = true; });
  assert.equal(processedAgain, false);
});

test('order limit applies across function instances with concurrent requests and resets after a minute', async () => {
  const blobs = memoryBlobs();
  let time = 1_000;
  async function request(ip = '192.0.2.1') {
    let status;
    const res = { set() {}, status(value) { status = value; return this; }, json() {} };
    await createBlobRateLimit(blobs, () => time)({ path: '/payments/orders', ip }, res, error => { if (error) throw error; status = 200; });
    return status;
  }
  const statuses = await Promise.all(Array.from({ length: 8 }, () => request()));
  assert.equal(statuses.filter(status => status === 200).length, 5);
  assert.equal(statuses.filter(status => status === 429).length, 3);
  assert.equal(await request('192.0.2.2'), 200);
  time += 60_001;
  assert.equal(await request(), 200);
});

test('Lambda adapter verifies payment with persistent async store before returning Zoho fields', async () => {
  const { default: serverless } = await import('serverless-http');
  const { createApp } = await import('../server/app.js');
  const { createHmac } = await import('node:crypto');
  const blobs = memoryBlobs();
  const config = { amount: 250000, startsAt: '2099-10-29T09:00:00+05:30', keyId: 'rzp_test_example', keySecret: 'test-secret', webhookSecret: 'webhook-secret', ready: true, origin: 'https://example.com', production: true, policies: {}, venue: 'Test Hospital', supportEmail: 'support@example.com' };
  let captured = false;
  const gateway = {
    async createOrder(amount) { return { id: 'order_1', amount, currency: 'INR' }; },
    async getPayment() { return { id: 'pay_1', order_id: 'order_1', amount: config.amount, currency: 'INR', status: captured ? 'captured' : 'authorized', captured }; },
  };
  async function call(path, body) {
    // Construct a fresh app and adapter for every request, like a cold start.
    const app = createApp({ config, gateway, store: createBlobStore(blobs), apiLimiter: createBlobRateLimit(blobs) });
    const run = serverless(app);
    const response = await run({ path: `/api/${path}`, httpMethod: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify(body), requestContext: { identity: { sourceIp: '192.0.2.1' } } }, {});
    return { status: response.statusCode, data: JSON.parse(response.body) };
  }
  const order = await call('payments/orders', { firstName: 'Test', lastName: 'Doctor', email: 'test@example.com', phone: '+91 9999999999', organization: 'Test Hospital', specialty: 'Cardiology', consent: true });
  assert.equal(order.status, 201);
  const verification = { ...order.data, razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: createHmac('sha256', config.keySecret).update('order_1|pay_1').digest('hex') };
  const pending = await call('payments/verify', verification);
  assert.equal(pending.status, 200);
  assert.equal(pending.data.status, 'pending');
  assert.equal(pending.data.zohoFields, null);
  captured = true;
  const paid = await call('payments/verify', verification);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.status, 'paid');
  assert.equal(paid.data.zohoFields.Email, 'test@example.com');
  assert.equal(JSON.parse(paid.data.zohoFields.SingleLine1).razorpay_payment_id, 'pay_1');
});

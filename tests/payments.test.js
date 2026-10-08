import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { parsePrice, validSignature, validateRegistration } from '../server/payments.js';
import { readConfig } from '../server/config.js';
import { ZOHO_FIELD_NAMES, ZOHO_FORM_ACTION, submitZohoForm } from '../shared/zoho.js';

const attendee = { firstName: 'Test', lastName: 'Doctor', email: 'test@example.com', phone: '+91 9999999999', organization: 'Test Hospital', specialty: 'Cardiology', consent: true };
const sign = (message, secret = 'test-secret') => createHmac('sha256', secret).update(message).digest('hex');

async function harness(t, overrides = {}) {
  const store = createStore(':memory:');
  const config = { amount: 250000, startsAt: '2099-10-29T09:00:00+05:30', keyId: 'rzp_test_local', keySecret: 'test-secret', webhookSecret: 'webhook-secret',
    venue: 'VPS Lakeshore Hospital', supportEmail: 'support@example.com', ready: true, origin: 'https://example.com', production: false,
    policies: { terms: 'https://example.com/terms', privacy: 'https://example.com/privacy', refund: 'https://example.com/refund' }, ...overrides };
  let counter = 0;
  let payment = { id: 'pay_123', order_id: 'order_1', amount: config.amount, currency: 'INR', status: 'captured', captured: true };
  let requestedAmount;
  const gateway = {
    createOrder: async amount => { requestedAmount = amount; return { id: `order_${++counter}`, amount, currency: 'INR' }; },
    getPayment: async () => payment,
    getOrderPayments: async () => ({ items: [payment] }),
  };
  const app = createApp({ config, store, gateway });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, headers = {}) {
    const res = await fetch(`${base}/api/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  }
  async function order() { const response = await request('payments/orders', attendee); assert.equal(response.status, 201); return response.data; }
  async function verify(orderData, signature = sign(`${orderData.orderId}|pay_123`)) {
    return request('payments/verify', { ...orderData, razorpay_order_id: orderData.orderId, razorpay_payment_id: 'pay_123', razorpay_signature: signature });
  }
  async function webhook(event, signature) {
    const body = JSON.stringify(event);
    const res = await fetch(`${base}/api/payments/webhook`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature || sign(body, 'webhook-secret') } });
    return { status: res.status, data: await res.json() };
  }
  return { store, config, request, order, verify, webhook, getPayment: () => payment, setPayment: value => { payment = { ...payment, ...value }; }, requestedAmount: () => requestedAmount };
}

test('money parsing is exact to paise and rejects malformed configuration', () => {
  assert.equal(parsePrice('2999.99'), 299999); assert.equal(parsePrice(''), null);
  for (const value of ['0', '-5', '10.001', 'abc', 'Infinity']) assert.throws(() => parsePrice(value));
});
test('signatures fail closed for wrong payloads, malformed hex and missing secrets', () => {
  assert.equal(validSignature('test', sign('test'), 'test-secret'), true);
  assert.equal(validSignature('changed', sign('test'), 'test-secret'), false);
  assert.equal(validSignature('test', 'bad', 'test-secret'), false);
  assert.equal(validSignature('test', sign('test'), ''), false);
});
test('specialty remains independent from hospital and required fields are validated', () => {
  const result = validateRegistration(attendee);
  assert.equal(result.specialty, 'Cardiology'); assert.equal(result.organization, 'Test Hospital');
  for (const change of [{ specialty: '' }, { email: 'invalid' }, { phone: 'abcdefghijk' }, { consent: false }]) assert.throws(() => validateRegistration({ ...attendee, ...change }));
});
test('configuration requires confirmed date, policies, price and gateway credentials', () => {
  assert.equal(readConfig({}).ready, false);
  assert.throws(() => readConfig({ WORKSHOP_STARTS_AT: 'not-a-date' }));
  assert.throws(() => readConfig({ TERMS_URL: 'javascript:alert(1)' }));
});
test('unconfigured checkout never creates a charge', async t => {
  const h = await harness(t, { ready: false });
  assert.equal((await h.request('payments/orders', attendee)).status, 503);
  assert.equal(h.requestedAmount(), undefined);
});
test('registration closes when the configured workshop date passes', async t => {
  const h = await harness(t, { startsAt: '2020-01-01T09:00:00+05:30' });
  assert.equal((await h.request('payments/orders', attendee)).status, 503);
});
test('orders use the server amount and ignore client price tampering', async t => {
  const h = await harness(t);
  const response = await h.request('payments/orders', { ...attendee, amount: 1, currency: 'USD' });
  assert.equal(response.status, 201); assert.equal(h.requestedAmount(), 250000);
  const registration = h.store.get(response.data.registrationId);
  assert.equal(registration.amount, 250000); assert.equal(registration.status, 'pending');
  assert.notEqual(registration.token_hash, response.data.token);
});
test('public config excludes server secrets', async t => {
  const h = await harness(t); const result = await h.request('workshop');
  assert.equal(result.status, 200); assert.equal(result.data.checkoutEnabled, true);
  assert.equal(result.data.keySecret, undefined); assert.equal(result.data.webhookSecret, undefined);
});
test('forged callback cannot confirm a registration', async t => {
  const h = await harness(t); const order = await h.order();
  assert.equal((await h.verify(order, '0'.repeat(64))).status, 400);
  assert.equal(h.store.get(order.registrationId).status, 'pending');
});
test('authorized payments stay pending until captured', async t => {
  const h = await harness(t); const order = await h.order();
  h.setPayment({ status: 'authorized', captured: false });
  const result = await h.verify(order);
  assert.equal(result.status, 200); assert.equal(result.data.status, 'pending');
  assert.equal(result.data.zohoFields, null);
});
test('captured payment confirms exactly once and persists its reference', async t => {
  const h = await harness(t); const order = await h.order();
  assert.equal((await h.verify(order)).data.status, 'paid');
  const paidAt = h.store.get(order.registrationId).paid_at;
  assert.equal((await h.verify(order)).data.paymentId, 'pay_123');
  assert.equal(h.store.get(order.registrationId).paid_at, paidAt);
});
test('wrong order, amount or currency never confirms', async t => {
  for (const change of [{ order_id: 'order_other' }, { amount: 1 }, { currency: 'USD' }]) {
    const h = await harness(t); const order = await h.order(); h.setPayment(change);
    assert.equal((await h.verify(order)).status, 400); assert.equal(h.store.get(order.registrationId).status, 'pending');
  }
});
test('another user cannot inspect a registration without its secret token', async t => {
  const h = await harness(t); const order = await h.order();
  assert.equal((await h.request('payments/status', { ...order, token: '0'.repeat(64) })).status, 403);
});
test('webhooks reject bad signatures and accept duplicate captured events idempotently', async t => {
  const h = await harness(t); const order = await h.order();
  const event = { event: 'payment.captured', payload: { payment: { entity: h.getPayment() } } };
  assert.equal((await h.webhook(event, 'a'.repeat(64))).status, 400);
  assert.equal(h.store.get(order.registrationId).status, 'pending');
  assert.equal((await h.webhook(event)).status, 200);
  const paidAt = h.store.get(order.registrationId).paid_at;
  assert.equal((await h.webhook(event)).status, 200);
  assert.equal(h.store.get(order.registrationId).status, 'paid');
  assert.equal(h.store.get(order.registrationId).paid_at, paidAt);
  assert.equal(h.store.db.prepare('SELECT COUNT(*) AS count FROM webhook_events').get().count, 1);
});
test('order.paid webhook can confirm without the browser callback', async t => {
  const h = await harness(t); const order = await h.order();
  await h.webhook({ event: 'order.paid', payload: { payment: { entity: h.getPayment() } } });
  assert.equal(h.store.get(order.registrationId).status, 'paid');
});
test('webhook amount mismatch cannot confirm and rolls back event recording', async t => {
  const h = await harness(t); const order = await h.order();
  const result = await h.webhook({ event: 'payment.captured', payload: { payment: { entity: { ...h.getPayment(), amount: 1 } } } });
  assert.equal(result.status, 400); assert.equal(h.store.get(order.registrationId).status, 'pending');
  assert.equal(h.store.db.prepare('SELECT COUNT(*) AS count FROM webhook_events').get().count, 0);
});
test('status reconciles a missed callback directly with the gateway', async t => {
  const h = await harness(t); const order = await h.order();
  const result = await h.request('payments/status', order);
  assert.equal(result.status, 200); assert.equal(result.data.status, 'paid');
});
test('unexpected cross-origin order requests are rejected', async t => {
  const h = await harness(t);
  assert.equal((await h.request('payments/orders', attendee, { origin: 'https://untrusted.example' })).status, 403);
});


test('verified payment populates the exact Zoho fields from stored attendee and payment data', async t => {
  const h = await harness(t);
  const response = await h.request('payments/orders', { ...attendee, SingleLine1: 'forged', zohoFields: { SingleLine1: 'forged' } });
  const result = await h.verify(response.data);
  assert.equal(result.status, 200);
  const fields = result.data.zohoFields;
  assert.deepEqual(Object.keys(fields), ZOHO_FIELD_NAMES);
  assert.equal(fields.Name_First, attendee.firstName);
  assert.equal(fields.Name_Last, attendee.lastName);
  assert.equal(fields.Email, attendee.email);
  assert.equal(fields.PhoneNumber_countrycode, '+919999999999');
  assert.equal(fields.SingleLine, attendee.organization);
  assert.equal(fields.SingleLine2, attendee.specialty);
  assert.deepEqual(JSON.parse(fields.SingleLine1), { status: 'captured', razorpay_payment_id: 'pay_123', razorpay_order_id: response.data.orderId });
  assert.ok(fields.SingleLine1.length <= 255);
  assert.equal(fields.zf_referrer_name, '');
  assert.equal(fields.zf_redirect_url, '');
  assert.equal(fields.zc_gad, '');
});

test('a missed callback recovers Zoho form data through payment status', async t => {
  const h = await harness(t); const order = await h.order();
  await h.webhook({ event: 'payment.captured', payload: { payment: { entity: h.getPayment() } } });
  const result = await h.request('payments/status', order);
  assert.equal(JSON.parse(result.data.zohoFields.SingleLine1).status, 'captured');
  assert.equal(result.data.zohoFields.Email, attendee.email);
});

test('Zoho form fields are filled before native submission', () => {
  const inputs = Object.fromEntries(ZOHO_FIELD_NAMES.map(name => [name, { value: '' }]));
  const fields = { Name_First: 'Test', Email: 'test@example.com', SingleLine1: '{"status":"captured"}' };
  let submitted = 0;
  submitZohoForm({
    elements: { namedItem: name => inputs[name] },
    submit() {
      submitted++;
      for (const name of ZOHO_FIELD_NAMES) assert.equal(inputs[name].value, fields[name] ?? '');
    },
  }, fields);
  assert.equal(submitted, 1);
});

test('security policy allows native submission to the supplied Zoho form', async t => {
  const h = await harness(t);
  // Inspect the same configured middleware without making any external submissions.
  const app = createApp({ config: h.config, store: h.store, gateway: {} });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/workshop');
  assert.ok(response.headers.get('content-security-policy').includes("form-action 'self' " + new URL(ZOHO_FORM_ACTION).origin));
});

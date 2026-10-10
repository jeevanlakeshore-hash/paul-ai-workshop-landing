import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/api.mjs';

test('deployed function retains the uncached Blobs endpoint for strong reads', async t => {
  const originalFetch = globalThis.fetch;
  const originalContext = globalThis.netlifyBlobsContext;
  const originalEnv = { ...process.env };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.netlifyBlobsContext = originalContext;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });
  for (const key of ['WORKSHOP_STARTS_AT', 'WORKSHOP_PRICE_INR', 'TERMS_URL', 'PRIVACY_URL', 'REFUND_URL']) delete process.env[key];
  process.env.PUBLIC_ORIGIN = 'https://www.vpslakeshorehospital.com/ai-workshop';
  // This context is provided by Netlify's modern Functions runtime.
  globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({
    siteID: 'test-site', token: 'fake-storage-token',
    edgeURL: 'https://cached.example.com',
    uncachedEdgeURL: 'https://uncached.example.com',
  })).toString('base64');
  const reads = [];
  globalThis.fetch = async (url, options) => {
    if (options.method.toUpperCase() === 'GET') {
      reads.push(String(url));
      return new Response(null, { status: 404 });
    }
    return new Response(null, { status: 200, headers: { etag: 'revision-1' } });
  };
  for (const path of ['/api/workshop', '/ai-workshop/api/workshop', '/.netlify/functions/api/workshop']) {
    const response = await handler(new Request(`https://example.com${path}`, { headers: { origin: 'https://example.com', 'x-nf-client-connection-ip': '192.0.2.1' } }));
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.equal(config.checkoutEnabled, false);
    assert.equal(config.keySecret, undefined);
  }
  assert.equal(reads.length, 0, 'workshop settings must not require storage');
  for (const path of ['/api/payments/status', '/.netlify/functions/api/payments/status']) {
    const response = await handler(new Request('https://example.com' + path, {
      method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'application/json', 'x-nf-client-connection-ip': '192.0.2.1' }, body: '{}',
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'Invalid registration access.');
  }
  // The main site proxies /ai-workshop to this Netlify host, so its origin differs from the request URL.
  const proxied = await handler(new Request('https://example.netlify.app/ai-workshop/api/payments/status', {
    method: 'POST', headers: { origin: 'https://www.vpslakeshorehospital.com', 'content-type': 'application/json', 'x-nf-client-connection-ip': '192.0.2.1' }, body: '{}',
  }));
  assert.equal(proxied.status, 403);
  assert.equal((await proxied.json()).error, 'Invalid registration access.');
  const foreign = await handler(new Request('https://example.com/api/payments/orders', {
    method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).error, 'This origin is not allowed.');
  assert.equal(reads.length, 3);
  assert.ok(reads.every(url => url.startsWith('https://uncached.example.com/')));
});

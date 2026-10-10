import serverless from 'serverless-http';
import { getStore } from '@netlify/blobs';
import { createApp } from '../../server/app.js';
import { createBlobStore } from '../../server/blob-store.js';
import { readConfig } from '../../server/config.js';
import { createGateway } from '../../server/gateway.js';
import { createBlobRateLimit } from '../../server/blob-rate-limit.js';

export default async function handler(request) {
  const url = new URL(request.url);
  const event = {
    path: url.pathname,
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text(),
    queryStringParameters: Object.fromEntries(url.searchParams),
    isBase64Encoded: false,
  };
  const config = readConfig({
    ...process.env,
    NODE_ENV: 'production',
    // The frontend and API share this Netlify host. A stale origin from a
    // previous deployment must not reject the current site's checkout.
    PUBLIC_ORIGIN: url.origin,
    // The adapter supplies the client IP; do not trust caller proxy headers.
    TRUST_PROXY_HOPS: '0',
  });
  const blobs = getStore({ name: `workshop-payments-${process.env.CONTEXT || 'production'}`, consistency: 'strong' });
  const store = createBlobStore(blobs);
  const app = createApp({ config, store, gateway: createGateway(config), apiLimiter: createBlobRateLimit(blobs) });
  // Normalize both the public rewrite and direct function URL.
  const path = event.path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '/api');
  const run = serverless(app, { request(req) {
    const ip = event.headers?.['x-nf-client-connection-ip'] || '127.0.0.1';
    req.socket.remoteAddress = ip;
    req.ip = ip;
  } });
  const result = await run({ ...event, path }, {});
  const headers = new Headers(result.headers);
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) {
    headers.delete(name);
    for (const value of values) headers.append(name, value);
  }
  const body = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body;
  return new Response(request.method === 'HEAD' ? null : body, { status: result.statusCode, headers });
}

import serverless from 'serverless-http';
import { connectLambda, getStore } from '@netlify/blobs';
import { createApp } from '../../server/app.js';
import { createBlobStore } from '../../server/blob-store.js';
import { readConfig } from '../../server/config.js';
import { createGateway } from '../../server/gateway.js';
import { createBlobRateLimit } from '../../server/blob-rate-limit.js';

export async function handler(event, context) {
  connectLambda(event);
  const config = readConfig({
    ...process.env,
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || process.env.URL,
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
  return run({ ...event, path }, context);
}

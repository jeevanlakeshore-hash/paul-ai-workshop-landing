import { createHash } from 'node:crypto';
import { HttpError } from './payments.js';

// Conditional writes enforce limits across function instances, rather than
// resetting an in-memory counter on each cold start.
export function createBlobRateLimit(blobs, now = Date.now) {
  return async (req, res, next) => {
    try {
      const order = req.path === '/orders' || req.path === '/payments/orders';
      const limit = order ? 5 : 30;
      const identity = createHash('sha256').update(req.ip || 'unknown').digest('hex');
      const key = `limits/${order ? 'orders' : 'api'}/${identity}`;
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await blobs.getWithMetadata(key, { type: 'json' });
        const time = now();
        const data = current && current.data.reset > time ? current.data : { count: 0, reset: time + 60_000 };
        if (data.count >= limit) {
          res.set('Retry-After', String(Math.max(1, Math.ceil((data.reset - time) / 1000))));
          return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
        }
        const result = await blobs.setJSON(key, { ...data, count: data.count + 1 }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
        if (result.modified) return next();
      }
      throw new HttpError(503, 'Registration is busy. Please try again shortly.');
    } catch (error) { next(error); }
  };
}

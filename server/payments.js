import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validSignature(message, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function parsePrice(value) {
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('WORKSHOP_PRICE_INR must be a positive rupee amount with at most two decimal places.');
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100000000) throw new Error('WORKSHOP_PRICE_INR is outside the supported range.');
  return amount;
}

export function validateRegistration(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Enter your registration details.');
  const result = {};
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'organization', 'specialty']) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 180) {
      throw new HttpError(400, `Please enter a valid ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
    }
    result[key] = input[key].trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!/^[+\d\s()-]+$/.test(result.phone) || !/^\d{7,15}$/.test(result.phone.replace(/\D/g, ''))) throw new HttpError(400, 'Enter a valid phone number.');
  if (input.consent !== true) throw new HttpError(400, 'Please accept the registration policies.');
  result.consentAt = new Date().toISOString();
  return result;
}

export function assertCaptured(payment, registration) {
  if (payment.order_id !== registration.order_id || payment.amount !== registration.amount || payment.currency !== 'INR') {
    throw new HttpError(400, 'Payment details do not match this registration.');
  }
  return payment.status === 'captured' && payment.captured === true;
}

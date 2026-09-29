import { HttpError } from './payments.js';

export function createGateway(config) {
  async function request(path, body) {
    try {
      const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Gateway request rejected');
      return await response.json();
    } catch { throw new HttpError(502, 'The payment provider is unavailable. Please try again shortly.'); }
  }
  return {
    createOrder: (amount, receipt) => request('orders', { amount, currency: 'INR', receipt, partial_payment: false }),
    getPayment: (id) => request(`payments/${encodeURIComponent(id)}`),
    getOrderPayments: (id) => request(`orders/${encodeURIComponent(id)}/payments`),
  };
}

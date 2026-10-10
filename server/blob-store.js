import { HttpError } from './payments.js';

// Immutable registrations and separate captured-payment records avoid lost
// updates when callbacks and webhooks run in different function instances.
export function createBlobStore(blobs) {
  const read = key => blobs.get(key, { type: 'json' });
  return {
    async insert(row) {
      const registration = { ...row, attendee: JSON.stringify(row.attendee), status: 'pending', payment_id: null, created_at: new Date().toISOString() };
      await blobs.setJSON(`registrations/${row.id}`, registration, { onlyIfNew: true });
      await blobs.setJSON(`orders/${row.order_id}`, { id: row.id }, { onlyIfNew: true });
    },
    async get(id) {
      const registration = await read(`registrations/${id}`);
      if (!registration) return null;
      const payment = await read(`paid/${id}`);
      return payment ? { ...registration, ...payment, status: 'paid' } : registration;
    },
    async byOrder(id) {
      const reference = await read(`orders/${id}`);
      return reference ? this.get(reference.id) : null;
    },
    async markPaid(id, paymentId) {
      const { modified } = await blobs.setJSON(`paid/${id}`, { payment_id: paymentId, paid_at: new Date().toISOString() }, { onlyIfNew: true });
      if (!modified) {
        const existing = await read(`paid/${id}`);
        if (existing?.payment_id !== paymentId) throw new HttpError(409, 'A different payment is already recorded for this registration. Contact support.');
      }
    },
    async processEvent(eventId, action) {
      if (await read(`events/${eventId}`)) return;
      // Record completion after the idempotent payment write. A failed write
      // remains retryable, including when two webhook deliveries overlap.
      await action();
      await blobs.setJSON(`events/${eventId}`, { received_at: new Date().toISOString() }, { onlyIfNew: true });
    },
  };
}

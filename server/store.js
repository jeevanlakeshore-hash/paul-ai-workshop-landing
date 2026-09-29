import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, order_id TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL, attendee TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT UNIQUE, created_at TEXT NOT NULL, paid_at TEXT
    );
    CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);`);
  return {
    db,
    insert(row) {
      db.prepare('INSERT INTO registrations (id, token_hash, order_id, amount, attendee, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, row.token_hash, row.order_id, row.amount, JSON.stringify(row.attendee), new Date().toISOString());
    },
    get: (id) => db.prepare('SELECT * FROM registrations WHERE id = ?').get(id),
    byOrder: (id) => db.prepare('SELECT * FROM registrations WHERE order_id = ?').get(id),
    markPaid(id, paymentId) {
      db.prepare("UPDATE registrations SET status = 'paid', payment_id = ?, paid_at = ? WHERE id = ? AND status != 'paid'")
        .run(paymentId, new Date().toISOString(), id);
    },
    processEvent(eventId, action) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!db.prepare('SELECT id FROM webhook_events WHERE id = ?').get(eventId)) {
          action();
          db.prepare('INSERT INTO webhook_events VALUES (?, ?)').run(eventId, new Date().toISOString());
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => db.close(),
  };
}

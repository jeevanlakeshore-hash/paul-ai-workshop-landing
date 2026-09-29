import { resolve } from 'node:path';
import { readConfig } from './config.js';
import { createStore } from './store.js';
import { createGateway } from './gateway.js';
import { createApp } from './app.js';

const config = readConfig();
const store = createStore(process.env.DATABASE_PATH || './data/workshop.sqlite');
const app = createApp({ config, store, gateway: createGateway(config), staticDir: resolve('dist') });
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => {
  console.log(`Workshop API: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`);
  console.log(config.ready ? 'Checkout configured. Complete Razorpay test payments before launch.' : 'Preview mode: configure event date, price, policies and Razorpay credentials to enable checkout.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));

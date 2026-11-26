import { createServer } from 'node:http';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

const db = openDb(config.dbPath);
const { handler, svc } = createApp(db);
await seed(db, svc);

// Housekeeping every 15 minutes: close finished auctions, settle verified trades, retire fully decayed cards.
setInterval(() => svc.maintenance().catch((e) => console.error('maintenance', e)), 15 * 60 * 1000).unref();

createServer(handler).listen(config.port, () => {
  console.log(`S/CELL running on http://localhost:${config.port}`);
});

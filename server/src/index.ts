import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, seedTeams } from './db.js';
import { ExpoPushSender, RoutingPushSender, WebPushSender } from './push.js';
import { startScheduler } from './scheduler.js';
import { Service } from './service.js';
import { loadVapidKeys } from './vapid.js';

const config = loadConfig();
const db = openDb(config.dbPath);
seedTeams(db, config.seedTeams, Date.now());
const vapid = loadVapidKeys(config);

const push = new RoutingPushSender(new ExpoPushSender(config.expoAccessToken), new WebPushSender(vapid));
const service = new Service(db, push);
const stopScheduler = startScheduler(service);
const app = createApp(service, { vapidPublicKey: vapid.publicKey, webDir: config.webDir });
const server = app.listen(config.port, () => {
  console.log(`Сервер оповещения запущен на порту ${config.port}`);
  if (config.webDir) console.log(`Веб-приложение раздаётся из ${config.webDir}`);
});

function shutdown() {
  stopScheduler();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

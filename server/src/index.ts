import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, seedTeams } from './db.js';
import { ExpoPushSender } from './push.js';
import { startScheduler } from './scheduler.js';
import { Service } from './service.js';

const config = loadConfig();
const db = openDb(config.dbPath);
seedTeams(db, config.seedTeams, Date.now());

const service = new Service(db, new ExpoPushSender(config.expoAccessToken));
const stopScheduler = startScheduler(service);
const server = createApp(service).listen(config.port, () => {
  console.log(`Сервер оповещения запущен на порту ${config.port} `);
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

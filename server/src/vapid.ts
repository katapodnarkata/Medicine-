import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import webpush from 'web-push';
import type { Config } from './config.js';
import type { VapidKeys } from './push.js';

/**
 * Ключи VAPID подписывают веб-уведомления. Если они не заданы в окружении,
 * создаются при первом запуске и сохраняются в vapid.json рядом с базой:
 * при смене ключей все подписки браузеров перестали бы работать.
 */
export function loadVapidKeys(config: Config): VapidKeys {
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey, subject: config.vapidSubject };
  }
  const file = join(dirname(config.dbPath), 'vapid.json');
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { publicKey: string; privateKey: string };
    return { ...saved, subject: config.vapidSubject };
  }
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.log(`Созданы ключи Web Push: ${file}`);
  return { ...keys, subject: config.vapidSubject };
}

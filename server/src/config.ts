/** Временные параметры из ТЗ (миллисекунды). */
export const CALL_DURATION_MS = 5 * 60 * 1000; // п.11: вызов активен 5 минут
export const RECIPIENTS_TTL_MS = 24 * 60 * 60 * 1000; // п.14: получатели и статусы хранятся 24 часа
export const HISTORY_TTL_MS = 72 * 60 * 60 * 1000; // п.14: история хранится 3 дня

export interface Config {
  port: number;
  dbPath: string;
  seedTeams: string[];
  expoAccessToken?: string;
  /** Папка со сборкой веб-приложения (PWA); сервер раздаёт её вместе с API. */
  webDir?: string;
  /** Ключи Web Push (VAPID). Если не заданы, создаются автоматически и хранятся рядом с базой. */
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? './data/team-alert.db',
    seedTeams: (process.env.SEED_TEAMS ?? 'צוות 1,צוות 2,צוות 3')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    webDir: process.env.WEB_DIR || undefined,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || undefined,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || undefined,
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
}

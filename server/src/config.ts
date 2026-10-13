/** Временные параметры из ТЗ (миллисекунды). */
export const CALL_DURATION_MS = 5 * 60 * 1000; // п.11: вызов активен 5 минут
export const RECIPIENTS_TTL_MS = 24 * 60 * 60 * 1000; // п.14: получатели и статусы хранятся 24 часа
export const HISTORY_TTL_MS = 72 * 60 * 60 * 1000; // п.14: история хранится 3 дня

export interface Config {
  port: number;
  dbPath: string;
  seedTeams: string[];
  expoAccessToken?: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? './data/team-alert.db',
    seedTeams: (process.env.SEED_TEAMS ?? 'Команда 1,Команда 2,Команда 3')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  };
}

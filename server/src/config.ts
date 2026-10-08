/** Временные параметры из ТЗ (миллисекунды). */
export const SMS_DELAY_MS = 10 * 1000; // п.10: SMS через 10 секунд без подтверждения
export const CALL_DURATION_MS = 5 * 60 * 1000; // п.11: вызов активен 5 минут
export const RECIPIENTS_TTL_MS = 24 * 60 * 60 * 1000; // п.14: получатели и статусы хранятся 24 часа
export const HISTORY_TTL_MS = 72 * 60 * 60 * 1000; // п.14: история хранится 3 дня

export interface Config {
  port: number;
  dbPath: string;
  seedTeams: string[];
  expoAccessToken?: string;
  sms:
    | { provider: 'console' }
    | { provider: 'smsru'; apiId: string; from?: string }
    | { provider: 'twilio'; accountSid: string; authToken: string; from: string };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export function loadConfig(): Config {
  const provider = process.env.SMS_PROVIDER ?? 'console';
  let sms: Config['sms'];
  switch (provider) {
    case 'console':
      sms = { provider };
      break;
    case 'smsru':
      sms = { provider, apiId: required('SMSRU_API_ID'), from: process.env.SMSRU_FROM || undefined };
      break;
    case 'twilio':
      sms = {
        provider,
        accountSid: required('TWILIO_ACCOUNT_SID'),
        authToken: required('TWILIO_AUTH_TOKEN'),
        from: required('TWILIO_FROM'),
      };
      break;
    default:
      throw new Error(`Неизвестный SMS_PROVIDER: ${provider}`);
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? './data/team-alert.db',
    seedTeams: (process.env.SEED_TEAMS ?? 'Команда 1,Команда 2,Команда 3')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    sms,
  };
}

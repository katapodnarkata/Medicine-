export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface PushResult {
  ok: boolean;
  error?: string;
  /** Токен больше недействителен (приложение удалено и т.п.) — его нужно забыть. */
  deviceNotRegistered?: boolean;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Идентификатор Android-канала уведомлений; должен совпадать с каналом в мобильном приложении. */
export const ANDROID_CHANNEL_ID = 'calls';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Отправка через Expo Push Service, который доставляет уведомления
 * на Android (FCM) и iOS (APNs).
 */
export class ExpoPushSender implements PushSender {
  constructor(private readonly accessToken?: string) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      results.push(...(await this.sendChunk(messages.slice(i, i + CHUNK_SIZE))));
    }
    return results;
  }

  private async sendChunk(messages: PushMessage[]): Promise<PushResult[]> {
    const payload = messages.map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data,
      // Обычный системный звук и вибрация. Режим «Не беспокоить» и беззвучный
      // режим не обходятся (п.8): critical-уведомления не используются.
      sound: 'default',
      priority: 'high',
      channelId: ANDROID_CHANNEL_ID,
      interruptionLevel: 'active',
      ttl: 300,
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { data?: ExpoTicket[]; errors?: { message: string }[] };
      if (!res.ok || !Array.isArray(json.data)) {
        const error = json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
        return messages.map(() => ({ ok: false, error }));
      }
      return json.data.map((ticket) =>
        ticket.status === 'ok'
          ? { ok: true }
          : {
              ok: false,
              error: ticket.message ?? ticket.details?.error ?? 'unknown',
              deviceNotRegistered: ticket.details?.error === 'DeviceNotRegistered',
            },
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return messages.map(() => ({ ok: false, error }));
    }
  }
}

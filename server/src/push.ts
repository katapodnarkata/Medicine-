import webpush from 'web-push';

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

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Контакт владельца сервера для служб доставки (mailto: или https:). */
  subject: string;
}

/** Push-подписка браузера хранится как JSON-строка вместо токена устройства. */
export function isWebPushToken(token: string): boolean {
  return token.startsWith('{');
}

/**
 * Web Push для веб-приложения (PWA): работает в Chrome на Android и в Safari
 * на iPhone (iOS 16.4+, приложение добавлено на экран «Домой»).
 */
export class WebPushSender implements PushSender {
  constructor(private readonly vapid: VapidKeys) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.all(messages.map((m) => this.sendOne(m)));
  }

  private async sendOne(m: PushMessage): Promise<PushResult> {
    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(m.to) as webpush.PushSubscription;
    } catch {
      return { ok: false, error: 'מינוי התראות לא תקין', deviceNotRegistered: true };
    }
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title: m.title, body: m.body, data: m.data }),
        { vapidDetails: this.vapid, TTL: 300, urgency: 'high' },
      );
      return { ok: true };
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        // 404/410: подписка удалена (приложение удалено или уведомления выключены).
        deviceNotRegistered: statusCode === 404 || statusCode === 410,
      };
    }
  }
}

/** Направляет каждое сообщение нужной службе по виду токена. */
export class RoutingPushSender implements PushSender {
  constructor(
    private readonly expo: PushSender,
    private readonly web: PushSender,
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const webIdx: number[] = [];
    const expoIdx: number[] = [];
    messages.forEach((m, i) => (isWebPushToken(m.to) ? webIdx : expoIdx).push(i));
    const [webResults, expoResults] = await Promise.all([
      webIdx.length ? this.web.send(webIdx.map((i) => messages[i])) : Promise.resolve([]),
      expoIdx.length ? this.expo.send(expoIdx.map((i) => messages[i])) : Promise.resolve([]),
    ]);
    const results: PushResult[] = new Array(messages.length);
    webIdx.forEach((idx, k) => (results[idx] = webResults[k]));
    expoIdx.forEach((idx, k) => (results[idx] = expoResults[k]));
    return results;
  }
}

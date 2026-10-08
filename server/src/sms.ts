import type { Config } from './config.js';

export interface SmsSender {
  /** Бросает исключение, если SMS не удалось отправить. */
  send(phone: string, text: string): Promise<void>;
}

/** Для разработки: SMS выводится в журнал сервера. */
export class ConsoleSmsSender implements SmsSender {
  async send(phone: string, text: string): Promise<void> {
    console.log(`[SMS] → ${phone}: ${text.replace(/\n/g, ' | ')}`);
  }
}

/** https://sms.ru/api/send */
export class SmsRuSender implements SmsSender {
  constructor(
    private readonly apiId: string,
    private readonly from?: string,
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const to = phone.replace(/^\+/, '');
    const body = new URLSearchParams({ api_id: this.apiId, to, msg: text, json: '1' });
    if (this.from) body.set('from', this.from);
    const res = await fetch('https://sms.ru/sms/send', { method: 'POST', body });
    const json = (await res.json()) as {
      status: string;
      status_text?: string;
      sms?: Record<string, { status: string; status_text?: string }>;
    };
    const item = json.sms?.[to];
    if (json.status !== 'OK' || (item && item.status !== 'OK')) {
      throw new Error(item?.status_text ?? json.status_text ?? 'sms.ru error');
    }
  }
}

/** https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource */
export class TwilioSmsSender implements SmsSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: phone, From: this.from, Body: text }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(json.message ?? `Twilio HTTP ${res.status}`);
    }
  }
}

export function createSmsSender(config: Config['sms']): SmsSender {
  switch (config.provider) {
    case 'console':
      return new ConsoleSmsSender();
    case 'smsru':
      return new SmsRuSender(config.apiId, config.from);
    case 'twilio':
      return new TwilioSmsSender(config.accountSid, config.authToken, config.from);
  }
}

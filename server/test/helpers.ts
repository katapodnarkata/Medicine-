import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp, type AppOptions } from '../src/app.js';
import { openDb, seedTeams } from '../src/db.js';
import type { PushMessage, PushResult, PushSender } from '../src/push.js';
import { Service } from '../src/service.js';

export class FakePush implements PushSender {
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    return messages.map(() => ({ ok: true }));
  }
}

export interface Harness {
  service: Service;
  push: FakePush;
  clock: { now: number };
  url: string;
  api: (method: string, path: string, token?: string, body?: unknown) => Promise<{ status: number; body: any }>;
  register: (name: string, phone: string, role: 'dispatcher' | 'participant') => Promise<{ token: string; user: any }>;
  close: () => Promise<void>;
}

export async function startHarness(options: AppOptions = {}): Promise<Harness> {
  const clock = { now: Date.UTC(2026, 9, 8, 12, 0, 0) };
  const db = openDb(':memory:');
  seedTeams(db, ['Команда 1', 'Команда 2'], clock.now);
  const push = new FakePush();
  const service = new Service(db, push, () => clock.now);
  const server: Server = await new Promise((resolve) => {
    const s = createApp(service, options).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api: Harness['api'] = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const register: Harness['register'] = async (name, phone, role) => {
    const res = await api('POST', '/api/register', undefined, { name, phone, role });
    if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    return res.body;
  };

  return {
    service,
    push,
    clock,
    url: base,
    api,
    register,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

/** Даёт завершиться асинхронной рассылке push после ответа сервера. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { RoutingPushSender, type PushMessage, type PushResult, type PushSender } from '../src/push.js';
import { flush, startHarness, type Harness } from './helpers.js';

class Recorder implements PushSender {
  sent: PushMessage[] = [];
  constructor(private readonly ok: boolean) {}
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    return messages.map(() => ({ ok: this.ok }));
  }
}

describe('веб-приложение (PWA)', () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('раздаёт веб-приложение и открывает его на любом адресе, кроме API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(dir, 'index.html'), '<html>app</html>');
    writeFileSync(join(dir, 'sw.js'), '// sw');
    h = await startHarness({ webDir: dir, vapidPublicKey: 'PUBKEY' });

    const base = await h.api('GET', '/api/push/public-key');
    assert.equal(base.body.publicKey, 'PUBKEY');

    const page = await fetch(h.url + '/call/5');
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<html>app</html>');
    const sw = await fetch(h.url + '/sw.js');
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.equal((await h.api('GET', '/api/unknown')).status, 401);
  });

  it('веб-подписка участника получает вызов', async () => {
    h = await startHarness();
    const d = await h.register('Диспетчер', '+79000000001', 'dispatcher');
    const [team] = (await h.api('GET', '/api/teams', d.token)).body;
    await h.api('PATCH', '/api/me', d.token, { teamId: team.id });
    const p = await h.register('Участник', '+79000000100', 'participant');
    const subscription = JSON.stringify({ endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } });
    assert.equal((await h.api('PUT', '/api/me/push-token', p.token, { token: subscription })).status, 204);
    await h.api('PUT', `/api/users/${p.user.id}/team`, d.token, { teamId: team.id });

    await h.api('POST', '/api/calls', d.token, {});
    await flush();
    assert.deepEqual(h.push.sent.map((m) => m.to), [subscription]);
  });
});

describe('RoutingPushSender', () => {
  it('отправляет веб-подписки через Web Push, а токены Expo — через Expo', async () => {
    const expo = new Recorder(true);
    const web = new Recorder(false);
    const results = await new RoutingPushSender(expo, web).send([
      { to: 'ExponentPushToken[a]', title: 't', body: 'b', data: {} },
      { to: '{"endpoint":"https://push.example/1"}', title: 't', body: 'b', data: {} },
      { to: 'ExponentPushToken[b]', title: 't', body: 'b', data: {} },
    ]);
    assert.deepEqual(expo.sent.map((m) => m.to), ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    assert.equal(web.sent.length, 1);
    assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
  });
});

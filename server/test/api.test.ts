import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { flush, startHarness, type Harness } from './helpers.js';

const SEC = 1000;
const HOUR = 60 * 60 * SEC;

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
});
afterEach(async () => {
  await h.close();
});

async function teams() {
  const d = await h.register('Служебный', '+79990000000', 'dispatcher');
  const res = await h.api('GET', '/api/teams', d.token);
  return res.body as { id: number; name: string }[];
}

/** Диспетчер с выбранной командой 1 и N участниками в ней. */
async function setup(participants = 2) {
  const [team1, team2] = await teams();
  const dispatcher = await h.register('Диспетчер', '+79000000001', 'dispatcher');
  await h.api('PATCH', '/api/me', dispatcher.token, { teamId: team1.id });
  const members = [];
  for (let i = 0; i < participants; i++) {
    const p = await h.register(`Участник ${i + 1}`, `+7900000010${i}`, 'participant');
    await h.api('PUT', '/api/me/push-token', p.token, { token: `ExponentPushToken[p${i}]` });
    await h.api('PUT', `/api/users/${p.user.id}/team`, dispatcher.token, { teamId: team1.id });
    members.push(p);
  }
  return { team1, team2, dispatcher, members };
}

describe('регистрация и профиль', () => {
  it('регистрирует диспетчера и участника (критерий 1)', async () => {
    const d = await h.register('Анна', '050-111-2233', 'dispatcher');
    assert.equal(d.user.role, 'dispatcher');
    assert.equal(d.user.phone, '+972501112233');
    const p = await h.register('Борис', '+972 50 111 2244', 'participant');
    assert.equal(p.user.role, 'participant');
    const bad = await h.api('POST', '/api/register', undefined, { name: 'X', phone: '123', role: 'participant' });
    assert.equal(bad.status, 400);
    const noRole = await h.api('POST', '/api/register', undefined, { name: 'X', phone: '+79001112255' });
    assert.equal(noRole.status, 400);
  });

  it('изменение данных не создаёт нового пользователя (критерий 16)', async () => {
    const d = await h.register('Анна', '+79001112233', 'participant');
    const res = await h.api('PATCH', '/api/me', d.token, { name: 'Анна П.', phone: '+79009998877' });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, d.user.id);
    assert.equal(res.body.name, 'Анна П.');
    assert.equal(res.body.phone, '+79009998877');
    // Повторная регистрация с тем же номером возвращает того же пользователя.
    const again = await h.register('Анна Петрова', '+79009998877', 'participant');
    assert.equal(again.user.id, d.user.id);
    const me = await h.api('GET', '/api/me', d.token);
    assert.equal(me.body.name, 'Анна Петрова');
  });

  it('пользователь может удалить свой аккаунт', async () => {
    const d = await h.register('Анна', '+79001112233', 'participant');
    assert.equal((await h.api('DELETE', '/api/me', d.token)).status, 204);
    assert.equal((await h.api('GET', '/api/me', d.token)).status, 401);
    // Тот же номер можно зарегистрировать заново — это будет новый аккаунт.
    const again = await h.register('Анна', '+79001112233', 'participant');
    assert.notEqual(again.user.id, d.user.id);
  });

  it('понимает разные записи израильского номера', async () => {
    const forms = ['050-123-4567', '0501234567', '+972 50 123 4567', '972501234567', '00972501234567', '50-123-4567'];
    for (const phone of forms) {
      const res = await h.api('POST', '/api/register', undefined, { name: 'Тест', phone, role: 'participant' });
      assert.equal(res.body.user.phone, '+972501234567', phone);
    }
    // Иностранный номер с «+» сохраняется как есть.
    const foreign = await h.register('Гость', '+7 900 111 22 33', 'participant');
    assert.equal(foreign.user.phone, '+79001112233');
  });

  it('не даёт занять чужой номер телефона', async () => {
    await h.register('Анна', '+79001112233', 'participant');
    const b = await h.register('Борис', '+79001112244', 'participant');
    const res = await h.api('PATCH', '/api/me', b.token, { phone: '+79001112233' });
    assert.equal(res.status, 409);
  });

  it('требует авторизацию', async () => {
    assert.equal((await h.api('GET', '/api/me')).status, 401);
    assert.equal((await h.api('GET', '/api/me', 'wrong')).status, 401);
  });
});

describe('команды', () => {
  it('пользователь состоит только в одной команде (критерий 2, 4)', async () => {
    const { team1, team2, dispatcher, members } = await setup(2);
    const p = members[0];
    let m1 = await h.api('GET', `/api/teams/${team1.id}/members`, dispatcher.token);
    assert.deepEqual(m1.body.map((u: any) => u.id).sort(), members.map((m) => m.user.id).sort());

    // Перевод в другую команду убирает из прежней.
    const moved = await h.api('PUT', `/api/users/${p.user.id}/team`, dispatcher.token, { teamId: team2.id });
    assert.equal(moved.body.team.id, team2.id);
    m1 = await h.api('GET', `/api/teams/${team1.id}/members`, dispatcher.token);
    assert.ok(!m1.body.some((u: any) => u.id === p.user.id));
    const m2 = await h.api('GET', `/api/teams/${team2.id}/members`, dispatcher.token);
    assert.deepEqual(m2.body.map((u: any) => u.id), [p.user.id]);

    // Удаление из команды.
    await h.api('PUT', `/api/users/${p.user.id}/team`, dispatcher.token, { teamId: null });
    const me = await h.api('GET', '/api/me', p.token);
    assert.equal(me.body.team, null);
  });

  it('диспетчер выбирает любую команду и может создать новую (критерий 3)', async () => {
    const { team2, dispatcher } = await setup(0);
    const res = await h.api('PATCH', '/api/me', dispatcher.token, { teamId: team2.id });
    assert.equal(res.body.team.id, team2.id);
    const created = await h.api('POST', '/api/teams', dispatcher.token, { name: 'Команда 3' });
    assert.equal(created.status, 201);
    const dup = await h.api('POST', '/api/teams', dispatcher.token, { name: 'Команда 3' });
    assert.equal(dup.status, 409);
  });

  it('участник не может управлять командами', async () => {
    const { team1, members } = await setup(2);
    const res = await h.api('PUT', `/api/users/${members[1].user.id}/team`, members[0].token, { teamId: team1.id });
    assert.equal(res.status, 403);
    assert.equal((await h.api('DELETE', `/api/users/${members[1].user.id}`, members[0].token)).status, 403);
    assert.equal((await h.api('POST', '/api/calls', members[0].token, {})).status, 403);
  });
});

describe('вызовы', () => {
  it('быстрый вызов отправляется сразу всем участникам команды (критерии 5, 7)', async () => {
    const { dispatcher, members } = await setup(3);
    const res = await h.api('POST', '/api/calls', dispatcher.token, { kind: 'car' });
    assert.equal(res.status, 201);
    assert.equal(res.body.text, '🚨 קריאה\n🚑 לאמבולנס');
    assert.equal(res.body.recipients.length, 3);
    assert.ok(res.body.recipients.every((r: any) => r.status === 'pending'));
    await flush();
    assert.equal(h.push.sent.length, 3);
    assert.deepEqual(h.push.sent.map((m) => m.to).sort(), members.map((_, i) => `ExponentPushToken[p${i}]`).sort());
    assert.equal(h.push.sent[0].title, '🚨 קריאה');
    assert.equal(h.push.sent[0].body, '🚑 לאמבולנס');
    assert.deepEqual(h.push.sent[0].data, { type: 'call', callId: res.body.id });
  });

  it('вызов с указанием места (критерий 6)', async () => {
    const { dispatcher, members } = await setup(1);
    const res = await h.api('POST', '/api/calls', dispatcher.token, { kind: 'place', place: 'כניסה ראשית, קומה 2' });
    assert.equal(res.status, 201);
    assert.equal(res.body.text, '🚨 קריאה\n📍 כניסה ראשית, קומה 2');
    const mine = await h.api('GET', `/api/calls/${res.body.id}`, members[0].token);
    assert.equal(mine.body.text, res.body.text);
    assert.equal(mine.body.recipients, undefined);
    assert.equal(mine.body.myStatus, 'pending');
    const empty = await h.api('POST', '/api/calls', dispatcher.token, { kind: 'place', place: '  ' });
    assert.equal(empty.status, 400);
  });

  it('подтверждение «Я УВИДЕЛ» видно диспетчеру (критерии 8, 9)', async () => {
    const { dispatcher, members } = await setup(2);
    const call = (await h.api('POST', '/api/calls', dispatcher.token, {})).body;
    const active = await h.api('GET', '/api/calls/active', members[0].token);
    assert.deepEqual(active.body.map((c: any) => c.id), [call.id]);

    const ack = await h.api('POST', `/api/calls/${call.id}/ack`, members[0].token);
    assert.equal(ack.status, 200);
    assert.equal(ack.body.myStatus, 'seen');
    const view = await h.api('GET', `/api/calls/${call.id}`, dispatcher.token);
    const byId = new Map(view.body.recipients.map((r: any) => [r.userId, r.status]));
    assert.equal(byId.get(members[0].user.id), 'seen');
    assert.equal(byId.get(members[1].user.id), 'pending');
  });

  it('вызов завершается через 5 минут и блокирует новый до завершения (критерий 12)', async () => {
    const { dispatcher, members } = await setup(1);
    const call = (await h.api('POST', '/api/calls', dispatcher.token, {})).body;
    assert.equal(call.expiresAt - call.createdAt, 5 * 60 * SEC);
    h.clock.now += 4 * 60 * SEC;
    const blocked = await h.api('POST', '/api/calls', dispatcher.token, {});
    assert.equal(blocked.status, 409);
    h.clock.now += 60 * SEC;
    const ended = await h.api('GET', `/api/calls/${call.id}`, dispatcher.token);
    assert.equal(ended.body.active, false);
    assert.equal((await h.api('GET', '/api/calls/active', members[0].token)).body.length, 0);
    assert.equal((await h.api('POST', `/api/calls/${call.id}/ack`, members[0].token)).status, 409);
    const next = await h.api('POST', '/api/calls', dispatcher.token, {});
    assert.equal(next.status, 201);
  });

  it('разные диспетчеры независимы (критерий 13)', async () => {
    const { team2, dispatcher } = await setup(1);
    const d2 = await h.register('Диспетчер 2', '+79000000002', 'dispatcher');
    await h.api('PATCH', '/api/me', d2.token, { teamId: team2.id });
    const p = await h.register('Участник B', '+79000000200', 'participant');
    await h.api('PUT', `/api/users/${p.user.id}/team`, d2.token, { teamId: team2.id });

    assert.equal((await h.api('POST', '/api/calls', dispatcher.token, {})).status, 201);
    assert.equal((await h.api('POST', '/api/calls', d2.token, {})).status, 201);
    const active2 = await h.api('GET', '/api/calls/active', d2.token);
    assert.equal(active2.body.length, 1);
    assert.equal(active2.body[0].teamId, team2.id);
  });

  it('состав получателей фиксируется в момент отправки (п.13, п.15, п.16)', async () => {
    const { team1, team2, dispatcher, members } = await setup(4);
    const call = (await h.api('POST', '/api/calls', dispatcher.token, {})).body;
    await h.api('PUT', `/api/users/${members[0].user.id}/team`, dispatcher.token, { teamId: team2.id });
    assert.equal((await h.api('DELETE', `/api/users/${members[1].user.id}`, dispatcher.token)).status, 204);
    const late = await h.register('Новичок', '+79000000999', 'participant');
    await h.api('PUT', `/api/users/${late.user.id}/team`, dispatcher.token, { teamId: team1.id });

    const view = await h.api('GET', `/api/calls/${call.id}`, dispatcher.token);
    assert.equal(view.body.recipients.length, 4);
    assert.deepEqual(view.body.recipients.map((r: any) => r.userId).sort(), members.map((m) => m.user.id).sort());
    // Удалённый пользователь больше не может войти.
    assert.equal((await h.api('GET', '/api/me', members[1].token)).status, 401);
    // Переведённый участник всё ещё получатель старого вызова и может его подтвердить.
    assert.equal((await h.api('POST', `/api/calls/${call.id}/ack`, members[0].token)).status, 200);
    // Новичок не является получателем.
    assert.equal((await h.api('GET', `/api/calls/${call.id}`, late.token)).status, 404);

    // Следующий вызов команды 1 уходит уже новому составу.
    h.clock.now += 5 * 60 * SEC;
    const next = (await h.api('POST', '/api/calls', dispatcher.token, {})).body;
    assert.deepEqual(
      next.recipients.map((r: any) => r.userId).sort(),
      [members[2].user.id, members[3].user.id, late.user.id].sort(),
    );
  });

  it('нельзя отправить вызов без выбранной команды или в пустую команду', async () => {
    const d = await h.register('Диспетчер', '+79000000001', 'dispatcher');
    assert.equal((await h.api('POST', '/api/calls', d.token, {})).status, 400);
    const [team1] = (await h.api('GET', '/api/teams', d.token)).body;
    await h.api('PATCH', '/api/me', d.token, { teamId: team1.id });
    assert.equal((await h.api('POST', '/api/calls', d.token, {})).status, 400);
  });
});

describe('история', () => {
  it('получатели хранятся 24 часа, вызовы — 3 дня (критерии 14, 15)', async () => {
    const { dispatcher, members } = await setup(2);
    const call = (await h.api('POST', '/api/calls', dispatcher.token, {})).body;

    let history = await h.api('GET', '/api/calls/history', dispatcher.token);
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].teamName, 'Команда 1');
    assert.equal(history.body[0].dispatcherName, 'Диспетчер');
    assert.equal(history.body[0].recipients.length, 2);

    h.clock.now += 24 * HOUR;
    h.service.cleanup();
    history = await h.api('GET', '/api/calls/history', dispatcher.token);
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].text, call.text);
    assert.equal(history.body[0].recipients, null);
    assert.equal((await h.api('GET', `/api/calls/${call.id}`, members[0].token)).status, 404);

    h.clock.now += 48 * HOUR;
    h.service.cleanup();
    history = await h.api('GET', '/api/calls/history', dispatcher.token);
    assert.equal(history.body.length, 0);
  });
});

import { createHash, randomBytes } from 'node:crypto';
import {
  CALL_DURATION_MS,
  HISTORY_TTL_MS,
  RECIPIENTS_TTL_MS,
  SMS_DELAY_MS,
} from './config.js';
import { transaction, type Db } from './db.js';
import { CAR_PLACE, callText } from './messages.js';
import type { PushSender } from './push.js';
import type { SmsSender } from './sms.js';

export type Role = 'dispatcher' | 'participant';
export type CallKind = 'car' | 'place';

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface UserRow {
  id: number;
  name: string;
  phone: string;
  role: Role;
  team_id: number | null;
  team_name: string | null;
  push_token: string | null;
}

interface CallRow {
  id: number;
  team_id: number;
  team_name: string;
  dispatcher_id: number;
  dispatcher_name: string;
  kind: CallKind;
  place: string | null;
  text: string;
  created_at: number;
  expires_at: number;
}

interface RecipientRow {
  call_id: number;
  user_id: number;
  name: string;
  phone: string;
  push_token: string | null;
  acknowledged_at: number | null;
  sms_sent_at: number | null;
}

export interface UserDto {
  id: number;
  name: string;
  phone: string;
  role: Role;
  team: { id: number; name: string } | null;
}

export interface TeamDto {
  id: number;
  name: string;
  memberCount: number;
}

export type RecipientStatus = 'seen' | 'pending';

export interface RecipientDto {
  userId: number;
  name: string;
  phone: string;
  status: RecipientStatus;
  smsSent: boolean;
}

export interface CallDto {
  id: number;
  teamId: number;
  teamName: string;
  dispatcherId: number;
  dispatcherName: string;
  kind: CallKind;
  place: string | null;
  text: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  /** Только для диспетчера; null — данные получателей уже удалены (старше 24 часов). */
  recipients?: RecipientDto[] | null;
  /** Только для участника-получателя: его собственный статус. */
  myStatus?: RecipientStatus;
}

const USER_SELECT = `
  SELECT u.id, u.name, u.phone, u.role, u.team_id, t.name AS team_name, u.push_token
  FROM users u LEFT JOIN teams t ON t.id = u.team_id`;

export function normalizePhone(input: unknown): string {
  if (typeof input !== 'string') throw new AppError(400, 'Укажите номер телефона');
  let digits = input.replace(/\D/g, '');
  // Российские номера: 8XXXXXXXXXX и XXXXXXXXXX приводятся к +7XXXXXXXXXX.
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && !input.trim().startsWith('+')) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) throw new AppError(400, 'Некорректный номер телефона');
  return `+${digits}`;
}

function cleanName(input: unknown, what = 'имя'): string {
  if (typeof input !== 'string' || !input.trim()) throw new AppError(400, `Укажите ${what}`);
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length > 100) throw new AppError(400, `Слишком длинное значение: ${what}`);
  return value;
}

function parseRole(input: unknown): Role {
  if (input === 'dispatcher' || input === 'participant') return input;
  throw new AppError(400, 'Выберите роль: диспетчер или участник');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    team: row.team_id != null && row.team_name != null ? { id: row.team_id, name: row.team_name } : null,
  };
}

export class Service {
  constructor(
    private readonly db: Db,
    private readonly push: PushSender,
    private readonly sms: SmsSender,
    readonly now: () => number = Date.now,
  ) {}

  // ---------- Пользователи и профиль ----------

  /**
   * Регистрация (п.2, п.17). Повторная регистрация с тем же номером телефона
   * не создаёт нового пользователя, а обновляет существующего (п.3) — так
   * пользователь может войти заново после переустановки приложения.
   */
  register(input: { name: unknown; phone: unknown; role: unknown }): { token: string; user: UserDto } {
    const name = cleanName(input.name);
    const phone = normalizePhone(input.phone);
    const role = parseRole(input.role);
    const now = this.now();
    return transaction(this.db, () => {
      const existing = this.db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as
        | { id: number }
        | undefined;
      let userId: number;
      if (existing) {
        userId = existing.id;
        this.db
          .prepare('UPDATE users SET name = ?, role = ?, updated_at = ? WHERE id = ?')
          .run(name, role, now, userId);
      } else {
        const res = this.db
          .prepare('INSERT INTO users (name, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(name, phone, role, now, now);
        userId = Number(res.lastInsertRowid);
      }
      const token = randomBytes(32).toString('base64url');
      this.db
        .prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)')
        .run(hashToken(token), userId, now);
      return { token, user: this.getUser(userId) };
    });
  }

  authenticate(token: string): UserDto | null {
    const row = this.db
      .prepare(`${USER_SELECT} JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ?`)
      .get(hashToken(token)) as UserRow | undefined;
    return row ? toUserDto(row) : null;
  }

  logout(token: string, userId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    this.db.prepare('UPDATE users SET push_token = NULL WHERE id = ?').run(userId);
  }

  getUser(userId: number): UserDto {
    const row = this.db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(userId) as UserRow | undefined;
    if (!row) throw new AppError(404, 'Пользователь не найден');
    return toUserDto(row);
  }

  /** Изменение собственных данных (п.3): всегда обновляет существующую запись. */
  updateMe(
    userId: number,
    input: { name?: unknown; phone?: unknown; role?: unknown; teamId?: unknown },
  ): UserDto {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    if (input.name !== undefined) {
      sets.push('name = ?');
      values.push(cleanName(input.name));
    }
    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone);
      const other = this.db.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').get(phone, userId);
      if (other) throw new AppError(409, 'Этот номер телефона уже используется другим пользователем');
      sets.push('phone = ?');
      values.push(phone);
    }
    if (input.role !== undefined) {
      sets.push('role = ?');
      values.push(parseRole(input.role));
    }
    if (input.teamId !== undefined) {
      sets.push('team_id = ?');
      values.push(this.parseTeamId(input.teamId));
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(this.now(), userId);
      this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getUser(userId);
  }

  setPushToken(userId: number, token: unknown): void {
    if (token !== null && (typeof token !== 'string' || !token || token.length > 512)) {
      throw new AppError(400, 'Некорректный push-токен');
    }
    transaction(this.db, () => {
      // Одно устройство — один пользователь: если на телефоне сменили аккаунт,
      // прежний владелец перестаёт получать уведомления на это устройство.
      if (token) this.db.prepare('UPDATE users SET push_token = NULL WHERE push_token = ? AND id <> ?').run(token, userId);
      this.db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(token, userId);
    });
  }

  // ---------- Команды ----------

  listTeams(): TeamDto[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.name,
                (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.role = 'participant') AS member_count
         FROM teams t ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as { id: number; name: string; member_count: number }[];
    return rows.map((r) => ({ id: r.id, name: r.name, memberCount: r.member_count }));
  }

  createTeam(actor: UserDto, name: unknown): TeamDto {
    this.requireDispatcher(actor);
    const teamName = cleanName(name, 'название команды');
    const exists = this.db.prepare('SELECT id FROM teams WHERE name = ?').get(teamName);
    if (exists) throw new AppError(409, 'Команда с таким названием уже существует');
    const res = this.db.prepare('INSERT INTO teams (name, created_at) VALUES (?, ?)').run(teamName, this.now());
    return { id: Number(res.lastInsertRowid), name: teamName, memberCount: 0 };
  }

  /** Состав команды — участники, которые в ней состоят. */
  teamMembers(teamId: number): UserDto[] {
    this.parseTeamId(teamId);
    const rows = this.db
      .prepare(`${USER_SELECT} WHERE u.team_id = ? AND u.role = 'participant' ORDER BY u.name COLLATE NOCASE`)
      .all(teamId) as unknown as UserRow[];
    return rows.map(toUserDto);
  }

  /** Все участники — для добавления в команду. */
  listParticipants(actor: UserDto): UserDto[] {
    this.requireDispatcher(actor);
    const rows = this.db
      .prepare(`${USER_SELECT} WHERE u.role = 'participant' ORDER BY u.name COLLATE NOCASE`)
      .all() as unknown as UserRow[];
    return rows.map(toUserDto);
  }

  /**
   * Добавление в команду, перевод в другую команду (teamId) или удаление из
   * команды (null). Пользователь состоит только в одной команде, поэтому
   * добавление в новую команду автоматически убирает его из прежней (п.4, п.16).
   */
  setUserTeam(actor: UserDto, userId: number, teamId: unknown): UserDto {
    this.requireDispatcher(actor);
    const target = this.getUser(userId);
    if (target.role !== 'participant') throw new AppError(400, 'Управлять можно только участниками');
    this.db
      .prepare('UPDATE users SET team_id = ?, updated_at = ? WHERE id = ?')
      .run(this.parseTeamId(teamId), this.now(), userId);
    return this.getUser(userId);
  }

  /** Полное удаление участника (п.15). Уже созданные вызовы не изменяются. */
  deleteUser(actor: UserDto, userId: number): void {
    this.requireDispatcher(actor);
    const target = this.getUser(userId);
    if (target.role !== 'participant') throw new AppError(400, 'Удалить можно только участника');
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ---------- Вызовы ----------

  /** Создаёт вызов для выбранной диспетчером команды (п.6, п.11–13). */
  createCall(actor: UserDto, input: { kind?: unknown; place?: unknown }): CallDto {
    this.requireDispatcher(actor);
    if (!actor.team) throw new AppError(400, 'Сначала выберите команду');
    let kind: CallKind;
    let place: string | null = null;
    if (input.kind === 'car' || input.kind === undefined) {
      kind = 'car';
    } else if (input.kind === 'place') {
      place = cleanName(input.place, 'место встречи');
      if (place.length > 200) throw new AppError(400, 'Слишком длинное описание места');
      kind = place.toLowerCase() === CAR_PLACE.toLowerCase() ? 'car' : 'place';
      if (kind === 'car') place = null;
    } else {
      throw new AppError(400, 'Неизвестный тип вызова');
    }

    const now = this.now();
    const team = actor.team;
    const callId = transaction(this.db, () => {
      // Один диспетчер не может отправить новый вызов своей команде, пока
      // текущий не завершён (п.11). Вызовы других диспетчеров не мешают (п.12).
      const active = this.db
        .prepare('SELECT id, expires_at FROM calls WHERE dispatcher_id = ? AND team_id = ? AND expires_at > ?')
        .get(actor.id, team.id, now) as { id: number; expires_at: number } | undefined;
      if (active) {
        const left = Math.ceil((active.expires_at - now) / 1000);
        throw new AppError(409, `Предыдущий вызов ещё активен (осталось ${left} с)`);
      }
      // Снимок состава команды на момент отправки (п.13).
      const members = this.db
        .prepare("SELECT id, name, phone, push_token FROM users WHERE team_id = ? AND role = 'participant'")
        .all(team.id) as { id: number; name: string; phone: string; push_token: string | null }[];
      if (members.length === 0) throw new AppError(400, 'В выбранной команде нет участников');

      const res = this.db
        .prepare(
          `INSERT INTO calls (team_id, team_name, dispatcher_id, dispatcher_name, kind, place, text, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(team.id, team.name, actor.id, actor.name, kind, place, callText(kind, place), now, now + CALL_DURATION_MS);
      const id = Number(res.lastInsertRowid);
      const insert = this.db.prepare(
        'INSERT INTO call_recipients (call_id, user_id, name, phone, push_token) VALUES (?, ?, ?, ?, ?)',
      );
      for (const m of members) insert.run(id, m.id, m.name, m.phone, m.push_token);
      return id;
    });
    return this.getCall(actor, callId);
  }

  /** Рассылает push-уведомления всем получателям вызова (п.8). */
  async sendPushes(callId: number): Promise<void> {
    const call = this.db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as CallRow | undefined;
    if (!call) return;
    const recipients = this.db
      .prepare('SELECT * FROM call_recipients WHERE call_id = ? AND push_token IS NOT NULL')
      .all(callId) as unknown as RecipientRow[];
    const noToken = this.db.prepare(
      "UPDATE call_recipients SET push_error = 'Нет push-токена' WHERE call_id = ? AND push_token IS NULL",
    );
    noToken.run(callId);
    if (recipients.length === 0) return;

    const [title, ...rest] = call.text.split('\n');
    const results = await this.push.send(
      recipients.map((r) => ({
        to: r.push_token!,
        title,
        body: rest.join('\n'),
        data: { type: 'call', callId: call.id },
      })),
    );
    results.forEach((result, i) => {
      const r = recipients[i];
      if (result.ok) return;
      this.db
        .prepare('UPDATE call_recipients SET push_error = ? WHERE call_id = ? AND user_id = ?')
        .run(result.error ?? 'error', callId, r.user_id);
      if (result.deviceNotRegistered) {
        this.db.prepare('UPDATE users SET push_token = NULL WHERE push_token = ?').run(r.push_token);
      }
    });
  }

  getCall(actor: UserDto, callId: number): CallDto {
    const now = this.now();
    const row = this.db
      .prepare('SELECT * FROM calls WHERE id = ? AND created_at > ?')
      .get(callId, now - HISTORY_TTL_MS) as CallRow | undefined;
    if (!row) throw new AppError(404, 'Вызов не найден');
    if (actor.role === 'dispatcher') return this.callDto(row, now, true);
    const mine = this.db
      .prepare('SELECT acknowledged_at FROM call_recipients WHERE call_id = ? AND user_id = ?')
      .get(callId, actor.id) as { acknowledged_at: number | null } | undefined;
    if (!mine) throw new AppError(404, 'Вызов не найден');
    return { ...this.callDto(row, now, false), myStatus: mine.acknowledged_at ? 'seen' : 'pending' };
  }

  /** Диспетчеру — его активные вызовы, участнику — активные вызовы, где он получатель. */
  activeCalls(actor: UserDto): CallDto[] {
    const now = this.now();
    if (actor.role === 'dispatcher') {
      const rows = this.db
        .prepare('SELECT * FROM calls WHERE dispatcher_id = ? AND expires_at > ? ORDER BY created_at DESC')
        .all(actor.id, now) as unknown as CallRow[];
      return rows.map((r) => this.callDto(r, now, true));
    }
    const rows = this.db
      .prepare(
        `SELECT c.*, cr.acknowledged_at FROM calls c
         JOIN call_recipients cr ON cr.call_id = c.id AND cr.user_id = ?
         WHERE c.expires_at > ? ORDER BY c.created_at DESC`,
      )
      .all(actor.id, now) as unknown as (CallRow & { acknowledged_at: number | null })[];
    return rows.map((r) => ({
      ...this.callDto(r, now, false),
      myStatus: r.acknowledged_at ? 'seen' : 'pending',
    }));
  }

  /** Кнопка «Я УВИДЕЛ» (п.9). */
  acknowledge(actor: UserDto, callId: number): CallDto {
    const now = this.now();
    const call = this.db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as CallRow | undefined;
    const recipient = call
      ? (this.db
          .prepare('SELECT acknowledged_at FROM call_recipients WHERE call_id = ? AND user_id = ?')
          .get(callId, actor.id) as { acknowledged_at: number | null } | undefined)
      : undefined;
    if (!call || !recipient) throw new AppError(404, 'Вызов не найден');
    if (call.expires_at <= now) throw new AppError(409, 'Вызов уже завершён');
    if (!recipient.acknowledged_at) {
      this.db
        .prepare('UPDATE call_recipients SET acknowledged_at = ? WHERE call_id = ? AND user_id = ?')
        .run(now, callId, actor.id);
    }
    return this.getCall(actor, callId);
  }

  /** История за 3 дня (п.14). */
  history(actor: UserDto): CallDto[] {
    const now = this.now();
    const rows = this.db
      .prepare('SELECT * FROM calls WHERE created_at > ? ORDER BY created_at DESC')
      .all(now - HISTORY_TTL_MS) as unknown as CallRow[];
    return rows.map((r) => this.callDto(r, now, actor.role === 'dispatcher'));
  }

  // ---------- Фоновые задачи ----------

  /**
   * SMS-резерв (п.10): через 10 секунд после отправки SMS получают только те,
   * кто к этому моменту не нажал «Я УВИДЕЛ». Каждый вызов обрабатывается один раз.
   */
  async processSms(): Promise<number> {
    const now = this.now();
    const jobs = transaction(this.db, () => {
      const due = this.db
        .prepare('SELECT id, text FROM calls WHERE sms_processed = 0 AND created_at <= ?')
        .all(now - SMS_DELAY_MS) as { id: number; text: string }[];
      const result: { callId: number; userId: number; phone: string; text: string }[] = [];
      for (const call of due) {
        this.db.prepare('UPDATE calls SET sms_processed = 1 WHERE id = ?').run(call.id);
        const pending = this.db
          .prepare('SELECT user_id, phone FROM call_recipients WHERE call_id = ? AND acknowledged_at IS NULL')
          .all(call.id) as { user_id: number; phone: string }[];
        for (const p of pending) result.push({ callId: call.id, userId: p.user_id, phone: p.phone, text: call.text });
      }
      return result;
    });

    await Promise.all(
      jobs.map(async (job) => {
        try {
          await this.sms.send(job.phone, job.text);
          this.db
            .prepare('UPDATE call_recipients SET sms_sent_at = ? WHERE call_id = ? AND user_id = ?')
            .run(this.now(), job.callId, job.userId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[SMS] ошибка отправки на ${job.phone}: ${message}`);
          this.db
            .prepare('UPDATE call_recipients SET sms_error = ? WHERE call_id = ? AND user_id = ?')
            .run(message, job.callId, job.userId);
        }
      }),
    );
    return jobs.length;
  }

  /** Очистка (п.14): получатели — через 24 часа, вызовы — через 3 дня. */
  cleanup(): void {
    const now = this.now();
    this.db
      .prepare('DELETE FROM call_recipients WHERE call_id IN (SELECT id FROM calls WHERE created_at <= ?)')
      .run(now - RECIPIENTS_TTL_MS);
    this.db.prepare('DELETE FROM calls WHERE created_at <= ?').run(now - HISTORY_TTL_MS);
  }

  // ---------- Вспомогательное ----------

  private callDto(row: CallRow, now: number, withRecipients: boolean): CallDto {
    const dto: CallDto = {
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name,
      dispatcherId: row.dispatcher_id,
      dispatcherName: row.dispatcher_name,
      kind: row.kind,
      place: row.place,
      text: row.text,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      active: row.expires_at > now,
    };
    if (withRecipients) {
      if (row.created_at <= now - RECIPIENTS_TTL_MS) {
        dto.recipients = null;
      } else {
        const recipients = this.db
          .prepare('SELECT * FROM call_recipients WHERE call_id = ? ORDER BY name COLLATE NOCASE')
          .all(row.id) as unknown as RecipientRow[];
        dto.recipients = recipients.map((r) => ({
          userId: r.user_id,
          name: r.name,
          phone: r.phone,
          status: r.acknowledged_at ? 'seen' : 'pending',
          smsSent: r.sms_sent_at != null,
        }));
      }
    }
    return dto;
  }

  private parseTeamId(input: unknown): number | null {
    if (input === null) return null;
    const id = Number(input);
    if (!Number.isInteger(id)) throw new AppError(400, 'Некорректная команда');
    const team = this.db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
    if (!team) throw new AppError(404, 'Команда не найдена');
    return id;
  }

  private requireDispatcher(actor: UserDto): void {
    if (actor.role !== 'dispatcher') throw new AppError(403, 'Действие доступно только диспетчеру');
  }
}

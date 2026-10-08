import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Для участника team_id — команда, в которой он состоит (только одна).
-- Для диспетчера team_id — выбранная им команда.
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('dispatcher', 'participant')),
  team_id    INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  push_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_team ON users(team_id, role);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

-- Вызов хранит копии названий команды и имени диспетчера, чтобы последующие
-- изменения пользователей и команд не влияли на уже созданные вызовы.
CREATE TABLE IF NOT EXISTS calls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id         INTEGER NOT NULL,
  team_name       TEXT NOT NULL,
  dispatcher_id   INTEGER NOT NULL,
  dispatcher_name TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('car', 'place')),
  place           TEXT,
  text            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  sms_processed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calls_dispatcher ON calls(dispatcher_id, team_id, expires_at);
CREATE INDEX IF NOT EXISTS calls_created ON calls(created_at);

-- Снимок состава команды на момент отправки (п.13). user_id намеренно без
-- внешнего ключа: удаление пользователя не изменяет уже созданные вызовы (п.15).
CREATE TABLE IF NOT EXISTS call_recipients (
  call_id         INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  push_token      TEXT,
  acknowledged_at INTEGER,
  sms_sent_at     INTEGER,
  sms_error       TEXT,
  push_error      TEXT,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX IF NOT EXISTS call_recipients_user ON call_recipients(user_id);
`;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function seedTeams(db: Db, names: string[], now: number): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM teams').get() as { n: number };
  if (count.n > 0) return;
  const insert = db.prepare('INSERT OR IGNORE INTO teams (name, created_at) VALUES (?, ?)');
  for (const name of names) insert.run(name, now);
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

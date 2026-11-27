'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function openAdminAuthDatabase(legacyDatabase) {
  const configuredPath = process.env.ADMIN_AUTH_DATABASE_PATH || './data/RAFA-admin-auth.db';
  if (typeof configuredPath !== 'string' || configuredPath.trim() === '') {
    throw new Error('ADMIN_AUTH_DATABASE_PATH must be a non-empty path.');
  }
  const databasePath = path.resolve(__dirname, '..', configuredPath);
  const legacyPath = legacyDatabase?.name;
  const resolvedLegacyPath = legacyPath ? path.resolve(legacyPath) : null;
  const sameDatabasePath = resolvedLegacyPath && (process.platform === 'win32'
    ? resolvedLegacyPath.toLowerCase() === databasePath.toLowerCase()
    : resolvedLegacyPath === databasePath);
  if (sameDatabasePath) {
    throw new Error('ADMIN_AUTH_DATABASE_PATH must be separate from DATABASE_PATH.');
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const authDb = new Database(databasePath);
  authDb.pragma('journal_mode = WAL');
  authDb.pragma('foreign_keys = ON');
  authDb.exec(`
    CREATE TABLE IF NOT EXISTS supabase_admin_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      auth_state TEXT NOT NULL CHECK (auth_state IN ('mfa_setup', 'mfa_pending', 'verified')),
      tokens_enc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS supabase_admin_sessions_user_id
      ON supabase_admin_sessions(user_id);
    CREATE INDEX IF NOT EXISTS supabase_admin_sessions_expires_at
      ON supabase_admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS supabase_admin_security (
      user_id TEXT PRIMARY KEY,
      totp_secret_enc TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
      totp_last_step INTEGER NOT NULL DEFAULT -1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supabase_admin_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_step_up_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  const legacyTables = new Set(legacyDatabase
    ? legacyDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all().map((row) => row.name)
    : []);
  const tablesToMove = [
    'supabase_admin_sessions',
    'supabase_admin_security',
    'supabase_admin_recovery_codes',
    'admin_step_up_sessions'
  ].filter((table) => legacyTables.has(table));

  if (tablesToMove.length) {
    const copyRows = authDb.transaction(() => {
      if (legacyTables.has('supabase_admin_sessions')) {
        const insert = authDb.prepare(`
          INSERT OR IGNORE INTO supabase_admin_sessions
            (session_hash, user_id, auth_state, tokens_enc, created_at, last_seen_at, expires_at)
          VALUES (@session_hash, @user_id, @auth_state, @tokens_enc, @created_at, @last_seen_at, @expires_at)
        `);
        legacyDatabase.prepare('SELECT * FROM supabase_admin_sessions').all()
          .forEach((row) => insert.run(row));
      }
      if (legacyTables.has('supabase_admin_security')) {
        const insert = authDb.prepare(`
          INSERT OR IGNORE INTO supabase_admin_security
            (user_id, totp_secret_enc, totp_enabled, totp_last_step, created_at, updated_at)
          VALUES (@user_id, @totp_secret_enc, @totp_enabled, @totp_last_step, @created_at, @updated_at)
        `);
        legacyDatabase.prepare('SELECT * FROM supabase_admin_security').all()
          .forEach((row) => insert.run(row));
      }
      if (legacyTables.has('supabase_admin_recovery_codes')) {
        const insert = authDb.prepare(`
          INSERT OR IGNORE INTO supabase_admin_recovery_codes
            (id, user_id, code_hash, created_at, used_at)
          VALUES (@id, @user_id, @code_hash, @created_at, @used_at)
        `);
        legacyDatabase.prepare('SELECT * FROM supabase_admin_recovery_codes').all()
          .forEach((row) => insert.run(row));
      }
      if (legacyTables.has('admin_step_up_sessions')) {
        const insert = authDb.prepare(`
          INSERT OR IGNORE INTO admin_step_up_sessions
            (session_hash, user_id, verified_at, expires_at)
          VALUES (@session_hash, @user_id, @verified_at, @expires_at)
        `);
        legacyDatabase.prepare('SELECT * FROM admin_step_up_sessions').all()
          .forEach((row) => insert.run(row));
      }
    });
    copyRows();
    legacyDatabase.transaction(() => {
      tablesToMove.forEach((table) => legacyDatabase.exec(`DROP TABLE "${table}"`));
    })();
  }

  return authDb;
}

module.exports = { openAdminAuthDatabase };

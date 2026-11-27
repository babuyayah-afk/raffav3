const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || './data/RAFA-events.db';
const resolvedPath = path.resolve(__dirname, '..', dbPath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const previousSessionColumns = db.prepare('PRAGMA table_info(admin_sessions)').all();
if (previousSessionColumns.length && !previousSessionColumns.some((column) => column.name === 'user_id')) {
  const legacySessionTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_sessions_legacy'"
  ).get();
  const legacyName = legacySessionTable
    ? `admin_sessions_legacy_${Date.now()}`
    : 'admin_sessions_legacy';
  const previousSessionIndexes = db.prepare('PRAGMA index_list(admin_sessions)').all();
  for (const index of previousSessionIndexes) {
    if (index.origin === 'c') {
      db.exec(`DROP INDEX "${index.name.replace(/"/g, '""')}"`);
    }
  }
  db.exec(`ALTER TABLE admin_sessions RENAME TO "${legacyName}"`);
}

// Persistent website content, customer submissions, and admin identity data.
db.exec(`
  CREATE TABLE IF NOT EXISTS order_requests (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    preferred_date TEXT,
    notes TEXT,
    items_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS celebration_requests (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    occasion TEXT NOT NULL,
    event_date TEXT,
    event_location TEXT NOT NULL DEFAULT '',
    guest_count INTEGER,
    budget TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    selections_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  );

  CREATE TABLE IF NOT EXISTS contact_inquiries (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    topic TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    details_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    quote TEXT NOT NULL,
    event_detail TEXT NOT NULL DEFAULT '',
    consent_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_at TEXT,
    reviewed_by TEXT
  );

  CREATE INDEX IF NOT EXISTS testimonials_status_created_at
    ON testimonials(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS site_content (
    content_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'support', 'viewer')),
    totp_secret_enc TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
    totp_last_step INTEGER NOT NULL DEFAULT -1,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    session_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    auth_state TEXT NOT NULL CHECK (auth_state IN ('mfa_setup', 'mfa_pending', 'verified')),
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS admin_sessions_expires_at
    ON admin_sessions(expires_at);

  CREATE INDEX IF NOT EXISTS admin_sessions_user_id
    ON admin_sessions(user_id);

  CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    used_at TEXT
  );

`);

if (process.env.ADMIN_AUTH_PROVIDER === 'sqlite') {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_step_up_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

module.exports = db;

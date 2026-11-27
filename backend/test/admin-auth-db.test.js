'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { openAdminAuthDatabase } = require('../src/adminAuthDb');

test('moves existing Supabase MFA and session state into a separate auth database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rafa-auth-db-'));
  const previousPath = process.env.ADMIN_AUTH_DATABASE_PATH;
  const businessPath = path.join(directory, 'business.sqlite');
  const authPath = path.join(directory, 'isolated-auth.sqlite');
  const businessDb = new Database(businessPath);
  businessDb.exec(`
    CREATE TABLE business_records (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO business_records VALUES ('keep', 'untouched');
    CREATE TABLE supabase_admin_sessions (
      session_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, auth_state TEXT NOT NULL,
      tokens_enc TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE supabase_admin_security (
      user_id TEXT PRIMARY KEY, totp_secret_enc TEXT, totp_enabled INTEGER NOT NULL,
      totp_last_step INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE supabase_admin_recovery_codes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, used_at TEXT
    );
    CREATE TABLE admin_step_up_sessions (
      session_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      verified_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    INSERT INTO supabase_admin_sessions VALUES
      ('hash', 'user', 'verified', 'encrypted-tokens', 'created', 'seen', 'expires');
    INSERT INTO supabase_admin_security VALUES
      ('user', 'encrypted-totp', 1, 123, 'created', 'updated');
    INSERT INTO supabase_admin_recovery_codes VALUES
      ('code', 'user', 'hash-code', 'created', NULL);
    INSERT INTO admin_step_up_sessions VALUES ('step-hash', 'user', 'verified', 'expires');
  `);

  try {
    process.env.ADMIN_AUTH_DATABASE_PATH = authPath;
    const authDb = openAdminAuthDatabase(businessDb);
    assert.deepEqual(authDb.prepare('SELECT * FROM supabase_admin_sessions').get(), {
      session_hash: 'hash',
      user_id: 'user',
      auth_state: 'verified',
      tokens_enc: 'encrypted-tokens',
      created_at: 'created',
      last_seen_at: 'seen',
      expires_at: 'expires'
    });
    assert.equal(authDb.prepare('SELECT totp_secret_enc FROM supabase_admin_security').get().totp_secret_enc,
      'encrypted-totp');
    assert.equal(authDb.prepare('SELECT code_hash FROM supabase_admin_recovery_codes').get().code_hash,
      'hash-code');
    assert.equal(authDb.prepare('SELECT session_hash FROM admin_step_up_sessions').get().session_hash,
      'step-hash');
    assert.equal(businessDb.prepare('SELECT value FROM business_records WHERE id = ?').get('keep').value,
      'untouched');
    assert.equal(businessDb.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND (name LIKE 'supabase_admin_%' OR name = 'admin_step_up_sessions')`
    ).all().length, 0);
    assert.notEqual(path.resolve(authDb.name), path.resolve(businessDb.name));
    authDb.close();
  } finally {
    businessDb.close();
    if (previousPath === undefined) delete process.env.ADMIN_AUTH_DATABASE_PATH;
    else process.env.ADMIN_AUTH_DATABASE_PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

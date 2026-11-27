'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { test } = require('node:test');

test('database startup preserves legacy admin sessions and content tokens', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rafa-db-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE admin_sessions (session_hash TEXT PRIMARY KEY, username TEXT NOT NULL);
    INSERT INTO admin_sessions (session_hash, username) VALUES ('old-session', 'owner');
    CREATE TABLE website_content_tokens (token TEXT PRIMARY KEY);
    INSERT INTO website_content_tokens (token) VALUES ('old-token');
  `);
  legacyDb.close();

  const previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = databasePath;
  let migratedDb;
  try {
    migratedDb = require('../src/db');
    assert.equal(
      migratedDb.prepare('SELECT username FROM admin_sessions_legacy WHERE session_hash = ?')
        .get('old-session').username,
      'owner'
    );
    assert.equal(
      migratedDb.prepare('SELECT token FROM website_content_tokens WHERE token = ?')
        .get('old-token').token,
      'old-token'
    );
    assert.ok(migratedDb.prepare('PRAGMA table_info(admin_sessions)').all()
      .some((column) => column.name === 'user_id'));
  } finally {
    if (migratedDb) migratedDb.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

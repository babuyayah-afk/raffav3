const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadConfig, parseFrontendOrigins } = require('../src/config/env');

const validEnvironment = {
  NODE_ENV: 'development',
  PORT: '3001',
  FRONTEND_ORIGINS: 'http://localhost:5500',
  RAFA_AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  DATABASE_PATH: './data/test.sqlite'
};

test('loads valid backend configuration', () => {
  assert.deepEqual(loadConfig(validEnvironment), {
    nodeEnv: 'development',
    port: 3001,
    frontendOrigins: ['http://localhost:5500'],
    authEncryptionKey: Buffer.alloc(32, 1).toString('base64'),
    databasePath: './data/test.sqlite',
    adminAuthDatabasePath: './data/RAFA-admin-auth.db',
    websiteDataProvider: 'supabase',
    adminAuthProvider: 'supabase'
  });
});

test('allows SQLite providers as an explicit fallback', () => {
  const config = loadConfig({
    ...validEnvironment,
    WEBSITE_DATA_PROVIDER: 'sqlite',
    ADMIN_AUTH_PROVIDER: 'sqlite'
  });
  assert.equal(config.websiteDataProvider, 'sqlite');
  assert.equal(config.adminAuthProvider, 'sqlite');
});

test('rejects invalid ports, missing origins, and invalid encryption keys', () => {
  assert.throws(() => loadConfig({ ...validEnvironment, PORT: '70000' }), /PORT/);
  assert.throws(() => loadConfig({ ...validEnvironment, FRONTEND_ORIGINS: '' }), /FRONTEND_ORIGINS/);
  assert.throws(() => loadConfig({ ...validEnvironment, RAFA_AUTH_ENCRYPTION_KEY: 'short' }), /RAFA_AUTH_ENCRYPTION_KEY/);
  assert.throws(() => loadConfig({ ...validEnvironment, WEBSITE_DATA_PROVIDER: 'unknown' }), /WEBSITE_DATA_PROVIDER/);
  assert.throws(() => loadConfig({ ...validEnvironment, ADMIN_AUTH_PROVIDER: 'unknown' }), /ADMIN_AUTH_PROVIDER/);
  assert.throws(() => loadConfig({
    ...validEnvironment,
    ADMIN_AUTH_DATABASE_PATH: validEnvironment.DATABASE_PATH
  }), /separate from DATABASE_PATH/);
});

test('requires HTTPS origins in production and rejects URL paths', () => {
  assert.throws(() => loadConfig({
    ...validEnvironment,
    NODE_ENV: 'production',
    FRONTEND_ORIGINS: 'http://rafa.example'
  }), /HTTPS/);
  assert.throws(() => parseFrontendOrigins('https://rafa.example/admin'), /origins only/);
});

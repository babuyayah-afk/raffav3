'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSupabaseConfig } = require('../src/config/supabase');

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-key'
};

test('loads Supabase configuration without exposing credentials in the result URL', () => {
  const config = loadSupabaseConfig(validEnv);
  assert.equal(config.url, 'https://example.supabase.co');
  assert.equal(config.anonKey, validEnv.SUPABASE_ANON_KEY);
  assert.equal(config.serviceRoleKey, validEnv.SUPABASE_SERVICE_ROLE_KEY);
});

test('allows HTTP only for local Supabase development', () => {
  assert.equal(
    loadSupabaseConfig({ ...validEnv, SUPABASE_URL: 'http://127.0.0.1:54321' }).url,
    'http://127.0.0.1:54321'
  );
  assert.equal(
    loadSupabaseConfig({
      ...validEnv,
      RAFA_ENV: 'development',
      SUPABASE_URL: 'http://127.0.0.1:54321'
    }).url,
    'http://127.0.0.1:54321'
  );
  assert.throws(
    () => loadSupabaseConfig({ ...validEnv, SUPABASE_URL: 'http://example.supabase.co' }),
    /HTTPS project origin/
  );
});

test('requires the selected RAFA environment to use its assigned hosted project', () => {
  const development = {
    ...validEnv,
    RAFA_ENV: 'development',
    SUPABASE_URL: 'https://jpitvhgyjsalswjuuwpm.supabase.co'
  };
  const production = {
    ...validEnv,
    RAFA_ENV: 'production',
    SUPABASE_URL: 'https://orybroticrcobzkxfpzv.supabase.co'
  };

  assert.equal(loadSupabaseConfig(development).url, development.SUPABASE_URL);
  assert.equal(loadSupabaseConfig(production).url, production.SUPABASE_URL);
  assert.throws(
    () => loadSupabaseConfig({ ...development, SUPABASE_URL: production.SUPABASE_URL }),
    /does not match the selected RAFA_ENV project/
  );
  assert.throws(
    () => loadSupabaseConfig({ ...production, SUPABASE_URL: development.SUPABASE_URL }),
    /does not match the selected RAFA_ENV project/
  );
  assert.throws(
    () => loadSupabaseConfig({ ...production, SUPABASE_URL: 'http://127.0.0.1:54321' }),
    /does not match the selected RAFA_ENV project/
  );
  assert.throws(
    () => loadSupabaseConfig({ ...development, RAFA_ENV: 'staging' }),
    /RAFA_ENV must be development or production/
  );
});

test('rejects missing keys and URLs containing paths or credentials', () => {
  assert.throws(
    () => loadSupabaseConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: '' }),
    /SUPABASE_SERVICE_ROLE_KEY/
  );
  assert.throws(
    () => loadSupabaseConfig({ ...validEnv, SUPABASE_URL: 'https://user:pass@example.supabase.co' }),
    /HTTPS project origin/
  );
  assert.throws(
    () => loadSupabaseConfig({ ...validEnv, SUPABASE_URL: 'https://example.supabase.co/project' }),
    /HTTPS project origin/
  );
});

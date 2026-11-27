'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveRuntimeEnvironment } = require('../src/config/runtimeEnvironment');

test('defaults local startup to the Development project and Development runtime', () => {
  assert.deepEqual(resolveRuntimeEnvironment({}), {
    rafaEnvironment: 'development',
    nodeEnvironment: 'development'
  });
});

test('allows secure production runtime settings while targeting the Development project', () => {
  assert.deepEqual(resolveRuntimeEnvironment({
    RAFA_ENV: 'development',
    NODE_ENV: 'production'
  }), {
    rafaEnvironment: 'development',
    nodeEnvironment: 'production'
  });
});

test('requires a production runtime when targeting the Production project', () => {
  assert.deepEqual(resolveRuntimeEnvironment({
    RAFA_ENV: 'production'
  }), {
    rafaEnvironment: 'production',
    nodeEnvironment: 'production'
  });
  assert.throws(() => resolveRuntimeEnvironment({
    RAFA_ENV: 'production',
    NODE_ENV: 'development'
  }), /NODE_ENV must be production/);
});

test('rejects unsupported runtime environment values', () => {
  assert.throws(() => resolveRuntimeEnvironment({
    RAFA_ENV: 'staging',
    NODE_ENV: 'production'
  }), /RAFA_ENV must be development or production/);
  assert.throws(() => resolveRuntimeEnvironment({
    RAFA_ENV: 'development',
    NODE_ENV: 'test'
  }), /NODE_ENV must be development or production/);
});

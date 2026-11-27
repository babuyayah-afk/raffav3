'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const adminSource = path.resolve(__dirname, '..', '..', 'admin');

function createAdminFixture() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rafa-admin-netlify-'));
  const adminDirectory = path.join(temporaryDirectory, 'admin');
  fs.cpSync(adminSource, adminDirectory, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes('dist')
  });
  return {
    adminDirectory,
    script: path.join(adminDirectory, 'scripts', 'prepare-netlify.js'),
    cleanup: () => fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  };
}

test('Netlify admin build requires a secure backend origin and writes a same-origin API proxy', (t) => {
  const fixture = createAdminFixture();
  t.after(fixture.cleanup);

  const missingTarget = spawnSync(process.execPath, [fixture.script], {
    encoding: 'utf8',
    env: { ...process.env, RAFA_API_PROXY_TARGET: '' }
  });
  assert.notEqual(missingTarget.status, 0);
  assert.match(missingTarget.stderr, /Set RAFA_API_PROXY_TARGET/);

  const insecureTarget = spawnSync(process.execPath, [fixture.script], {
    encoding: 'utf8',
    env: { ...process.env, RAFA_API_PROXY_TARGET: 'http://api.example.com' }
  });
  assert.notEqual(insecureTarget.status, 0);
  assert.match(insecureTarget.stderr, /HTTPS backend origin/);

  const build = spawnSync(process.execPath, [fixture.script], {
    encoding: 'utf8',
    env: { ...process.env, RAFA_API_PROXY_TARGET: 'https://api.example.com' }
  });
  assert.equal(build.status, 0, build.stderr);

  const output = path.join(fixture.adminDirectory, 'dist');
  const redirects = fs.readFileSync(path.join(output, '_redirects'), 'utf8');
  assert.match(redirects, /^\/api\/\* https:\/\/api\.example\.com\/api\/:splat 200$/m);
  assert.match(redirects, /^\/ \/admin\/ 302$/m);

  const loginHtml = fs.readFileSync(path.join(output, 'admin', 'login.html'), 'utf8');
  assert.match(loginHtml, /<meta name="rafa-api-base" content="">/);
});

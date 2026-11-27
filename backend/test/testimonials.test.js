const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rafa-testimonials-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(databaseDirectory, 'test.sqlite');
process.env.WEBSITE_DATA_PROVIDER = 'sqlite';
process.env.ADMIN_AUTH_PROVIDER = 'sqlite';
process.env.RAFA_AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 83).toString('base64');
process.env.FRONTEND_ORIGINS = 'http://localhost:5500';

const {
  createTotpCode,
  createTotpSecret,
  encryptTotpSecret,
  hashRecoveryCode,
  hashPassword
} = require('../src/adminAuth');
const app = require('../src/app');
const db = require('../src/db');

let server;
let apiBase;
let sessionCookie = '';
const allowedOrigin = 'http://localhost:5500';
const ownerPassword = 'Test-owner-password-2026!';
const ownerStepUpRecoveryCode = 'AAAAA-BBBBB';

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;

  const ownerId = require('node:crypto').randomUUID();
  const secret = createTotpSecret();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO admin_users
      (id, username, password_hash, role, totp_secret_enc, totp_enabled, created_at, updated_at)
    VALUES (?, 'owner', ?, 'owner', ?, 1, ?, ?)
  `).run(ownerId, await hashPassword(ownerPassword), encryptTotpSecret(secret), now, now);
  db.prepare(`
    INSERT INTO admin_recovery_codes (id, user_id, code_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(require('node:crypto').randomUUID(), ownerId, hashRecoveryCode(ownerStepUpRecoveryCode), now);
  db.prepare(`
    INSERT INTO site_content (content_key, value_json, updated_at)
    VALUES ('home.testimonials', ?, ?)
  `).run(JSON.stringify([{ quote: 'Old admin quote', name: 'Sample', detail: 'Unverified' }]), now);
});

after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(databaseDirectory, { recursive: true, force: true });
});

async function callApi(route, options = {}, controls = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Origin', controls.origin || allowedOrigin);
  const method = (options.method || 'GET').toUpperCase();
  if (options.body) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  const cookie = controls.cookie === undefined ? sessionCookie : controls.cookie;
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${apiBase}${route}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const matches = Array.from(setCookie.matchAll(/rafa_admin_session=([^;,]*)/g));
    if (matches.length) {
      const activeCookie = matches.map((match) => match[1]).filter(Boolean).pop();
      sessionCookie = activeCookie ? `rafa_admin_session=${activeCookie}` : '';
    }
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { response, body };
}

test('public testimonials require consent and stay unpublished until approved', async () => {
  const invalid = await callApi('/api/testimonials', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Alex Host',
      quote: 'Our event was thoughtful and beautifully organized.',
      detail: 'Wedding',
      consent: false
    })
  });
  assert.equal(invalid.response.status, 422);

  const submitted = await callApi('/api/testimonials', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Alex Host',
      quote: 'Our event was thoughtful and beautifully organized.',
      detail: 'Wedding · Nairobi',
      consent: true
    })
  });
  assert.equal(submitted.response.status, 201);
  assert.equal(submitted.body.status, 'pending');

  const publicBeforeReview = await callApi('/api/site-content');
  assert.equal(publicBeforeReview.response.status, 200);
  assert.deepEqual(publicBeforeReview.body.content['home.testimonials'], []);

  const unauthorizedQueue = await callApi('/api/admin/testimonials');
  assert.equal(unauthorizedQueue.response.status, 401);

  const secret = db.prepare('SELECT totp_secret_enc FROM admin_users WHERE username = ?')
    .get('owner').totp_secret_enc;
  const { decryptTotpSecret } = require('../src/adminAuth');
  const login = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'owner', password: ownerPassword })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.mfaState, 'mfa_pending');

  const verified = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code: createTotpCode(decryptTotpSecret(secret)) })
  });
  assert.equal(verified.response.status, 200);
  const stepUp = await callApi('/api/admin/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ password: ownerPassword, code: ownerStepUpRecoveryCode })
  });
  assert.equal(stepUp.response.status, 200);

  const queue = await callApi('/api/admin/testimonials');
  assert.equal(queue.response.status, 200);
  assert.equal(queue.body.items.length, 1);
  assert.equal(queue.body.items[0].quote, 'Our event was thoughtful and beautifully organized.');

  const invalidReview = await callApi(`/api/admin/testimonials/${submitted.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'pending' })
  });
  assert.equal(invalidReview.response.status, 422);

  const approved = await callApi(`/api/admin/testimonials/${submitted.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.status, 'approved');

  const publicAfterReview = await callApi('/api/site-content');
  assert.deepEqual(publicAfterReview.body.content['home.testimonials'], [{
    quote: 'Our event was thoughtful and beautifully organized.',
    name: 'Alex Host',
    detail: 'Wedding · Nairobi'
  }]);

  const rejectedSubmission = await callApi('/api/testimonials', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Taylor Guest',
      quote: 'Our event was thoughtfully planned and the team was wonderful.',
      detail: '',
      consent: true
    })
  });
  assert.equal(rejectedSubmission.response.status, 201);
  const rejected = await callApi(`/api/admin/testimonials/${rejectedSubmission.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'rejected' })
  });
  assert.equal(rejected.response.status, 200);
  const publicAfterRejection = await callApi('/api/site-content');
  assert.deepEqual(publicAfterRejection.body.content['home.testimonials'], [{
    quote: 'Our event was thoughtful and beautifully organized.',
    name: 'Alex Host',
    detail: 'Wedding · Nairobi'
  }]);

  const legacyEditorWrite = await callApi('/api/admin/site-content/home.testimonials', {
    method: 'PUT',
    body: JSON.stringify({ value: [] })
  });
  assert.equal(legacyEditorWrite.response.status, 422);

  const adminContent = await callApi('/api/admin/site-content');
  assert.equal(Object.hasOwn(adminContent.body.content, 'home.testimonials'), false);
});

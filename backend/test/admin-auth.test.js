const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rafa-admin-auth-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(databaseDirectory, 'test.sqlite');
process.env.WEBSITE_DATA_PROVIDER = 'sqlite';
process.env.ADMIN_AUTH_PROVIDER = 'sqlite';
process.env.RAFA_AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString('base64');
process.env.FRONTEND_ORIGINS = 'http://localhost:5500,http://127.0.0.1:5500';

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
let ownerId;
const allowedOrigin = 'http://localhost:5500';
const ownerPassword = 'Owner-password-2026!';
const backupOwnerPassword = 'Backup-owner-password-2026!';
const managerPassword = 'Manager-password-2026!';
const supportPassword = 'Support-password-2026!';
const viewerPassword = 'Viewer-password-2026!';
const ownerTotpSecret = createTotpSecret();
const ownerStepUpRecoveryCodes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;

  ownerId = cryptoRandomId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO admin_users
      (id, username, password_hash, role, totp_secret_enc, totp_enabled, created_at, updated_at)
    VALUES (?, 'owner', ?, 'owner', ?, 1, ?, ?)
  `).run(ownerId, await hashPassword(ownerPassword), encryptTotpSecret(ownerTotpSecret), now, now);
  const insertRecoveryCode = db.prepare(`
    INSERT INTO admin_recovery_codes (id, user_id, code_hash, created_at)
    VALUES (?, ?, ?, ?)
  `);
  ownerStepUpRecoveryCodes.forEach((code) =>
    insertRecoveryCode.run(cryptoRandomId(), ownerId, hashRecoveryCode(code), now)
  );
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(databaseDirectory, { recursive: true, force: true });
});

function cryptoRandomId() {
  return require('node:crypto').randomUUID();
}

async function stepUpOwner() {
  return callApi('/api/admin/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({
      password: ownerPassword,
      code: ownerStepUpRecoveryCodes.shift()
    })
  });
}

async function callApi(route, options = {}, controls = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Origin', controls.origin || allowedOrigin);
  const method = (options.method || 'GET').toUpperCase();
  if (options.body) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && controls.csrf !== false) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  const cookie = controls.cookie === undefined ? sessionCookie : controls.cookie;
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${apiBase}${route}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie && controls.updateCookie !== false) {
    const matches = Array.from(setCookie.matchAll(/rafa_admin_session=([^;,]*)/g));
    if (matches.length) {
      const activeCookie = matches.map((match) => match[1]).filter(Boolean).pop();
      sessionCookie = activeCookie ? `rafa_admin_session=${activeCookie}` : '';
    }
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { response, body, setCookie };
}

async function createUser(username, password, role) {
  return callApi('/api/admin/auth/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role })
  });
}

async function completeMfaEnrollment(username, password) {
  const login = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.mfaState, 'mfa_setup');

  const setup = await callApi('/api/admin/auth/mfa/setup', { method: 'POST' });
  assert.equal(setup.response.status, 200);
  assert.match(setup.body.qrCode, /^data:image\/png;base64,/);

  const confirmed = await callApi('/api/admin/auth/mfa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: createTotpCode(setup.body.secret) })
  });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.body.mfaEnabled, true);
  assert.equal(confirmed.body.recoveryCodes.length, 10);
  return { recoveryCodes: confirmed.body.recoveryCodes, secret: setup.body.secret };
}

test('password, MFA, sessions, and role permissions protect admin operations', async () => {
  const hiddenPage = await fetch(`${apiBase}/admin`, { redirect: 'manual' });
  assert.equal(hiddenPage.status, 302);
  assert.equal(hiddenPage.headers.get('location'), '/admin/login');
  const hiddenScript = await fetch(`${apiBase}/admin/dashboard.js`, { redirect: 'manual' });
  assert.equal(hiddenScript.status, 302);
  const hiddenIndex = await fetch(`${apiBase}/admin/index.html`, { redirect: 'manual' });
  assert.equal(hiddenIndex.status, 302);

  const authConfig = await callApi('/api/admin/auth/config');
  assert.deepEqual(authConfig.body, { provider: 'sqlite', loginField: 'username' });

  const publicContent = await callApi('/api/site-content');
  assert.equal(publicContent.response.status, 200);
  assert.deepEqual(publicContent.body.content, { 'home.testimonials': [] });

  const unauthorized = await callApi('/api/admin/site-content');
  assert.equal(unauthorized.response.status, 401);

  const badLogin = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'unknown', password: 'Invalid-password-123!' })
  });
  assert.equal(badLogin.response.status, 401);
  assert.deepEqual(badLogin.body, { error: 'invalid_credentials' });

  const missingCsrfHeader = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'owner', password: ownerPassword })
  }, { csrf: false });
  assert.equal(missingCsrfHeader.response.status, 403);

  const login = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'OWNER', password: ownerPassword })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.mfaState, 'mfa_pending');
  assert.match(login.setCookie, /HttpOnly/);
  assert.match(login.setCookie, /SameSite=Strict/);

  const pendingAccess = await callApi('/api/admin/site-content');
  assert.equal(pendingAccess.response.status, 403);
  assert.equal(pendingAccess.body.error, 'mfa_required');

  const ownerMfa = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code: createTotpCode(ownerTotpSecret) })
  });
  assert.equal(ownerMfa.response.status, 200);
  assert.equal(ownerMfa.body.authenticated, true);
  const adminPage = await fetch(`${apiBase}/admin`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Dashboard/i);
  const directAdminPage = await fetch(`${apiBase}/admin/index.html`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(directAdminPage.status, 200);
  const adminScript = await fetch(`${apiBase}/admin/dashboard.js`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(adminScript.status, 200);

  const rejectedStepUp = await callApi('/api/admin/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ password: 'Wrong-password-2026!', code: createTotpCode(ownerTotpSecret) })
  });
  assert.equal(rejectedStepUp.response.status, 401);
  const stepUp = await stepUpOwner();
  assert.equal(stepUp.response.status, 200);
  assert.equal(stepUp.body.verified, true);
  assert.equal(Date.parse(stepUp.body.expiresAt) - Date.now() <= 5 * 60 * 1000, true);

  const sessionRow = db.prepare('SELECT session_hash FROM admin_sessions WHERE user_id = ?').get(ownerId);
  assert.ok(sessionRow);
  assert.notEqual(sessionRow.session_hash, sessionCookie.replace('rafa_admin_session=', ''));

  const noCsrfContentWrite = await callApi('/api/admin/site-content/home.stats', {
    method: 'PUT',
    body: JSON.stringify({ value: [] })
  }, { csrf: false });
  assert.equal(noCsrfContentWrite.response.status, 403);

  const content = {
    floatingOne: { label: 'Guests this week', value: '1,240', unit: 'guests', bars: ['40', '62'] },
    floatingTwo: { title: 'Recent updates', items: [{ text: 'Confirmed venue', time: 'Today' }] }
  };
  const savedContent = await callApi('/api/admin/site-content/home.heroCards', {
    method: 'PUT',
    body: JSON.stringify({ value: content })
  });
  assert.equal(savedContent.response.status, 200);
  const publicRead = await callApi('/api/site-content');
  assert.deepEqual(publicRead.body.content['home.heroCards'], content);

  const userList = await callApi('/api/admin/auth/users');
  assert.equal(userList.response.status, 200);
  assert.deepEqual(userList.body.users.map((user) => user.role), ['owner']);
  const ownerDemotion = await callApi(`/api/admin/auth/users/${ownerId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'manager' })
  });
  assert.equal(ownerDemotion.response.status, 409);
  const ownerDisable = await callApi(`/api/admin/auth/users/${ownerId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: false })
  });
  assert.equal(ownerDisable.response.status, 409);

  const manager = await createUser('manager1', managerPassword, 'manager');
  const support = await createUser('support1', supportPassword, 'support');
  const viewer = await createUser('viewer1', viewerPassword, 'viewer');
  const backupOwner = await createUser('owner2', backupOwnerPassword, 'owner');
  assert.equal(manager.response.status, 201);
  assert.equal(support.response.status, 201);
  assert.equal(viewer.response.status, 201);
  assert.equal(backupOwner.response.status, 201);
  const selfDemotion = await callApi(`/api/admin/auth/users/${ownerId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'manager' })
  });
  assert.equal(selfDemotion.response.status, 409);
  assert.equal(selfDemotion.body.error, 'cannot_modify_current_account');
  const duplicate = await createUser('MANAGER1', managerPassword, 'viewer');
  assert.equal(duplicate.response.status, 409);

  const order = await callApi('/api/order-requests', {
    method: 'POST',
    body: JSON.stringify({
      customer_name: 'Sample Customer',
      customer_email: 'sample@example.com',
      customer_phone: '+254700000000',
      notes: 'Bakery collection',
      total: 1450,
      items: [{ name: 'Chocolate Cake', qty: 1, price: 1400 }]
    })
  });
  assert.equal(order.response.status, 201);
  assert.equal(order.body.total, 1400);
  assert.equal(order.body.total_is_estimate, true);

  await callApi('/api/admin/auth/logout', { method: 'POST' });
  const managerMfa = await completeMfaEnrollment('manager1', managerPassword);
  const managerWrite = await callApi('/api/admin/site-content/home.heroCards', {
    method: 'PUT',
    body: JSON.stringify({ value: content })
  });
  assert.equal(managerWrite.response.status, 200);
  const managerCookie = sessionCookie;
  await callApi('/api/admin/auth/logout', { method: 'POST' });
  const managerLogin = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'manager1', password: managerPassword })
  });
  assert.equal(managerLogin.body.mfaState, 'mfa_pending');
  const managerMfaLogin = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code: managerMfa.recoveryCodes[0] })
  });
  assert.equal(managerMfaLogin.response.status, 200);
  await callApi('/api/admin/auth/logout', { method: 'POST' });
  const managerReplayLogin = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'manager1', password: managerPassword })
  });
  assert.equal(managerReplayLogin.body.mfaState, 'mfa_pending');
  const reusedRecoveryCode = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code: managerMfa.recoveryCodes[0] })
  });
  assert.equal(reusedRecoveryCode.response.status, 401);
  await callApi('/api/admin/auth/logout', { method: 'POST' });

  await callApi('/api/admin/auth/logout', { method: 'POST' });
  await completeMfaEnrollment('support1', supportPassword);
  const supportRead = await callApi('/api/admin/site-content');
  assert.equal(supportRead.response.status, 200);
  const supportWrite = await callApi('/api/admin/site-content/home.heroCards', {
    method: 'PUT',
    body: JSON.stringify({ value: content })
  });
  assert.equal(supportWrite.response.status, 403);
  const supportStatusUpdate = await callApi(`/api/admin/order-requests/${order.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'preparing' })
  });
  assert.equal(supportStatusUpdate.response.status, 200);

  await callApi('/api/admin/auth/logout', { method: 'POST' });
  await completeMfaEnrollment('viewer1', viewerPassword);
  const viewerRead = await callApi('/api/admin/order-requests');
  assert.equal(viewerRead.response.status, 200);
  assert.equal(viewerRead.response.headers.get('cache-control'), 'no-store');
  assert.equal(viewerRead.body.items[0].total_is_estimate, true);
  const viewerStatusUpdate = await callApi(`/api/admin/order-requests/${order.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'ready' })
  });
  assert.equal(viewerStatusUpdate.response.status, 403);
  await callApi('/api/admin/auth/logout', { method: 'POST' });

  const ownerFinalLogin = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'owner', password: ownerPassword })
  });
  assert.equal(ownerFinalLogin.body.mfaState, 'mfa_pending');
  const ownerFinalMfa = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({
      code: createTotpCode(ownerTotpSecret, Math.max(
        Date.now(),
        (db.prepare('SELECT totp_last_step FROM admin_users WHERE id = ?').get(ownerId).totp_last_step + 1) *
          30000
      ))
    })
  });
  assert.equal(ownerFinalMfa.response.status, 200);
  const ownerStepUp = await stepUpOwner();
  assert.equal(ownerStepUp.response.status, 200, JSON.stringify(ownerStepUp.body));
  const resetManagerMfa = await callApi(`/api/admin/auth/users/${manager.body.user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ resetMfa: true })
  });
  assert.equal(resetManagerMfa.response.status, 200);
  assert.equal(resetManagerMfa.body.user.mfaEnabled, false);
  const staleManagerSession = await callApi('/api/admin/site-content', {}, {
    cookie: managerCookie,
    updateCookie: false
  });
  assert.equal(staleManagerSession.response.status, 401);
});

test('public submissions and health probes remain available', async () => {
  const newsletter = await callApi('/api/newsletter-subscriptions', {
    method: 'POST',
    body: JSON.stringify({ email: 'shopper@example.com' })
  });
  assert.equal(newsletter.response.status, 201);

  const live = await callApi('/health/live');
  assert.equal(live.response.status, 200);
  assert.deepEqual(live.body, { ok: true });
  const ready = await callApi('/health/ready');
  assert.equal(ready.response.status, 200);
  assert.deepEqual(ready.body, { ok: true });
});

test('CORS permits credentialed admin requests only from configured origins', async () => {
  const allowed = await fetch(`${apiBase}/health/live`, {
    headers: { Origin: allowedOrigin }
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await fetch(`${apiBase}/api/admin/auth/users`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-requested-with'
    }
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Requested-With/i);

  const rejected = await fetch(`${apiBase}/health/live`, {
    headers: { Origin: 'https://untrusted.example' }
  });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('admin request limits are isolated by method and matched route', async () => {
  let lastConfigResponse;
  for (let attempt = 0; attempt < 65; attempt += 1) {
    lastConfigResponse = await callApi('/api/admin/auth/config');
  }
  assert.equal(lastConfigResponse.response.status, 429);

  const sessionResponse = await callApi('/api/admin/auth/session');
  assert.equal(sessionResponse.response.status, 200);
});

'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const express = require('express');
const { after, before, test } = require('node:test');

process.env.RAFA_AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 29).toString('base64');

const { createTotpCode } = require('../src/adminAuth');
const { createSupabaseAdminAuth } = require('../src/services/supabaseAdminAuth');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE supabase_admin_sessions (
    session_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    auth_state TEXT NOT NULL,
    tokens_enc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE supabase_admin_security (
    user_id TEXT PRIMARY KEY,
    totp_secret_enc TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    totp_last_step INTEGER NOT NULL DEFAULT -1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE supabase_admin_recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE TABLE admin_step_up_sessions (
    session_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

const authUser = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test' };
const managerAuthUser = { id: '00000000-0000-4000-8000-000000000002', email: 'manager@example.test' };
const invitedAuthUser = { id: '00000000-0000-4000-8000-000000000003', email: 'newadmin@example.test' };
const authSession = { access_token: 'test-access-token', refresh_token: 'test-refresh-token' };
const rpcCalls = [];
const inviteCalls = [];
const adminTables = {
  admin_profiles: [
    {
      id: authUser.id,
      display_name: 'RAFA Owner',
      role_key: 'admin',
      is_active: true,
      created_at: '2026-11-19T00:00:00.000Z'
    },
    {
      id: managerAuthUser.id,
      display_name: 'RAFA Manager',
      role_key: 'manager',
      is_active: true,
      created_at: '2026-11-18T00:00:00.000Z'
    }
  ],
  role_permissions: [
    { role_key: 'admin', permission_key: 'content.read' },
    { role_key: 'admin', permission_key: 'content.write' },
    { role_key: 'admin', permission_key: 'users.manage' }
  ],
  roles: [
    { role_key: 'admin', name: 'Admin', description: 'Full access', is_system: true },
    { role_key: 'manager', name: 'Manager', description: 'Operational access', is_system: true },
    { role_key: 'inquiry_staff', name: 'Inquiry staff', description: 'Works inquiries', is_system: true },
    { role_key: 'catalogue_staff', name: 'Catalogue staff', description: 'Manages products', is_system: true },
    { role_key: 'viewer', name: 'Viewer', description: 'Read only', is_system: true }
  ]
};
const authUsers = new Map([
  [authUser.id, authUser],
  [managerAuthUser.id, managerAuthUser]
]);

class AdminQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.maxRows = Infinity;
    this.rangeStart = 0;
    this.rangeEnd = Infinity;
    this.orderBy = null;
    this.countRequested = false;
  }

  select(_fields, options = {}) { this.countRequested = options.count === 'exact'; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  limit(count) { this.maxRows = count; return this; }
  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false };
    return this;
  }
  range(from, to) { this.rangeStart = from; this.rangeEnd = to; return this; }

  result() {
    let rows = (adminTables[this.table] || []).filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
    );
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((left, right) => {
        const order = String(left[column]).localeCompare(String(right[column]));
        return ascending ? order : -order;
      });
    }
    const count = rows.length;
    rows = rows.slice(this.rangeStart, this.rangeEnd + 1).slice(0, this.maxRows);
    return { data: rows, count: this.countRequested ? count : null, error: null };
  }

  maybeSingle() {
    const result = this.result();
    return Promise.resolve({ ...result, data: result.data[0] || null });
  }
  then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
}

function createAuthClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }) {
        return email === authUser.email && password === 'Valid-password-2026!'
          ? { data: { user: authUser, session: authSession }, error: null }
          : {
              data: { user: null, session: null },
              error: { status: 400, message: 'Invalid login credentials' }
            };
      },
      async setSession() {
        return { data: { session: authSession }, error: null };
      },
      async getUser() {
        return { data: { user: authUser }, error: null };
      },
      async signOut() {
        return { error: null };
      }
    }
  };
}

let authService;
const app = express();
app.use(express.json());
app.use('/api/admin/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, (req, res, next) => authService.router(req, res, next));

authService = createSupabaseAdminAuth({
  db,
  createAuthClient,
  adminClient: {
    from(table) {
      return new AdminQuery(table);
    },
    async rpc(name, parameters) {
      rpcCalls.push({ name, parameters });
      if (name === 'create_admin_profile_with_audit') {
        const profile = {
          id: parameters.p_user_id,
          display_name: parameters.p_display_name,
          role_key: parameters.p_role_key,
          is_active: true,
          created_at: '2026-11-19T00:00:00.000Z',
          updated_at: '2026-11-19T00:00:00.000Z'
        };
        adminTables.admin_profiles.push(profile);
        return { data: profile, error: null };
      }
      if (name === 'update_admin_profile_with_audit') {
        const profile = adminTables.admin_profiles.find((item) => item.id === parameters.p_user_id);
        if (!profile) return { data: null, error: { code: 'P0002' } };
        if (parameters.p_display_name !== null) profile.display_name = parameters.p_display_name;
        if (parameters.p_role_key !== null) profile.role_key = parameters.p_role_key;
        if (parameters.p_is_active !== null) profile.is_active = parameters.p_is_active;
        profile.updated_at = '2026-11-19T00:01:00.000Z';
        return { data: profile, error: null };
      }
      return { data: null, error: { code: 'PGRST202' } };
    },
    auth: {
      admin: {
        async getUserById(id) {
          return { data: { user: authUsers.get(id) || null }, error: null };
        },
        async inviteUserByEmail(email, options) {
          inviteCalls.push({ email, options });
          if (Array.from(authUsers.values()).some((user) => user.email === email)) {
            return { data: { user: null }, error: { code: 'email_exists' } };
          }
          authUsers.set(invitedAuthUser.id, { ...invitedAuthUser, email });
          return { data: { user: { ...invitedAuthUser, email } }, error: null };
        },
        async deleteUser(id) {
          authUsers.delete(id);
          adminTables.admin_profiles = adminTables.admin_profiles.filter((profile) => profile.id !== id);
          return { data: { user: { id } }, error: null };
        }
      }
    }
  },
  requireAllowedOrigin: (req, res, next) => next(),
  requireAdmin(req, res, next) {
    authService.getSession(req).then((session) => {
      if (!session) return res.status(401).json({ error: 'unauthorized' });
      req.adminUser = session.user;
      req.adminSession = session;
      return next();
    }).catch(next);
  },
  requireAdminStepUp: (req, res, next) => next(),
  requireRoles(...roles) {
    return (req, res, next) => roles.includes(req.adminUser?.role)
      ? next()
      : res.status(403).json({ error: 'forbidden' });
  },
  limiters: Object.fromEntries(['login', 'admin', 'challenge', 'enrollment', 'users', 'stepUp']
    .map((key) => [key, (req, res, next) => next()])),
  logger: { error() {} }
});

let server;
let apiBase;
let sessionCookie = '';
let recoveryCodes = [];

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  db.close();
});

async function callApi(route, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();
  if (options.body) headers.set('Content-Type', 'application/json');
  if (sessionCookie) headers.set('Cookie', sessionCookie);
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

test('Supabase Auth login requires an active admin profile and declares email login', async () => {
  const config = await callApi('/api/admin/auth/config');
  assert.equal(config.response.status, 200);
  assert.deepEqual(config.body, { provider: 'supabase', loginField: 'email' });

  const invalid = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: authUser.email, password: 'wrong-password' })
  });
  assert.equal(invalid.response.status, 401);
  assert.deepEqual(invalid.body, { error: 'invalid_credentials' });

  const login = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: authUser.email, password: 'Valid-password-2026!' })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.mfaState, 'mfa_setup');
  assert.match(login.body.user.username, /owner@example\.test/);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
});

test('Supabase-linked accounts must enroll TOTP and verify before protected session access', async () => {
  const pendingSessionCookie = sessionCookie;
  const setup = await callApi('/api/admin/auth/mfa/setup', { method: 'POST' });
  assert.equal(setup.response.status, 200);
  assert.match(setup.body.qrCode, /^data:image\/png;base64,/);

  const wrongCode = await callApi('/api/admin/auth/mfa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: '000000' })
  });
  assert.equal(wrongCode.response.status, 422);

  const confirmed = await callApi('/api/admin/auth/mfa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: createTotpCode(setup.body.secret) })
  });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.body.recoveryCodes.length, 10);
  assert.notEqual(sessionCookie, pendingSessionCookie);
  recoveryCodes = confirmed.body.recoveryCodes;

  const session = await callApi('/api/admin/auth/session');
  assert.equal(session.response.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.role, 'owner');
  assert.ok(session.body.user.permissions.includes('content.write'));

  const lastStep = db.prepare(
    'SELECT totp_last_step FROM supabase_admin_security WHERE user_id = ?'
  ).get(authUser.id).totp_last_step;
  const stepUpTimestamp = Math.max(Date.now(), (lastStep + 1) * 30000);
  const stepUpCode = createTotpCode(setup.body.secret, stepUpTimestamp);
  const stepUp = await callApi('/api/admin/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ password: 'Valid-password-2026!', code: stepUpCode })
  });
  assert.equal(stepUp.response.status, 200);
  assert.equal(stepUp.body.verified, true);
  assert.ok(db.prepare('SELECT session_hash FROM admin_step_up_sessions').get());

  const replayedStepUp = await callApi('/api/admin/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ password: 'Valid-password-2026!', code: stepUpCode })
  });
  assert.equal(replayedStepUp.response.status, 401);

  const users = await callApi('/api/admin/auth/users?page=1&limit=1');
  assert.equal(users.response.status, 200);
  assert.deepEqual(users.body, {
    data: [{
      id: authUser.id,
      email: authUser.email,
      displayName: 'RAFA Owner',
      roleKey: 'admin',
      role: 'owner',
      roleName: 'Admin',
      active: true,
      createdAt: '2026-11-19T00:00:00.000Z'
    }],
    error: null,
    meta: { page: 1, limit: 1, total: 2 }
  });

  const nextPage = await callApi('/api/admin/auth/users?page=2&limit=1');
  assert.equal(nextPage.response.status, 200);
  assert.deepEqual(nextPage.body.data.map((user) => user.id), [managerAuthUser.id]);
  assert.deepEqual(nextPage.body.meta, { page: 2, limit: 1, total: 2 });

  const invalidQuery = await callApi('/api/admin/auth/users?page=0');
  assert.equal(invalidQuery.response.status, 400);
  assert.equal(invalidQuery.body.error.code, 'invalid_query');

  const originalRole = adminTables.admin_profiles[0].role_key;
  adminTables.admin_profiles[0].role_key = 'viewer';
  const forbidden = await callApi('/api/admin/auth/users');
  adminTables.admin_profiles[0].role_key = originalRole;
  assert.equal(forbidden.response.status, 403);
});

test('Owner can invite an admin and update the audited profile through the Supabase API', async () => {
  const invalidInvite = await callApi('/api/admin/auth/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'bad-email', displayName: '', roleKey: 'unknown' })
  });
  assert.equal(invalidInvite.response.status, 400);
  assert.equal(inviteCalls.length, 0);

  const invited = await callApi('/api/admin/auth/users', {
    method: 'POST',
    body: JSON.stringify({
      email: ' NewAdmin@Example.test ',
      displayName: 'New Admin',
      roleKey: 'inquiry_staff'
    })
  });
  assert.equal(invited.response.status, 201);
  assert.deepEqual(invited.body.data, {
    id: invitedAuthUser.id,
    email: 'newadmin@example.test',
    displayName: 'New Admin',
    roleKey: 'inquiry_staff',
    role: 'support',
    active: true,
    createdAt: '2026-11-19T00:00:00.000Z'
  });
  assert.equal(inviteCalls[0].email, 'newadmin@example.test');
  assert.deepEqual(rpcCalls.at(-1), {
    name: 'create_admin_profile_with_audit',
    parameters: {
      p_actor_user_id: authUser.id,
      p_user_id: invitedAuthUser.id,
      p_display_name: 'New Admin',
      p_role_key: 'inquiry_staff',
      p_request_id: null
    }
  });

  const updated = await callApi(`/api/admin/auth/users/${invitedAuthUser.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ roleKey: 'viewer', active: false })
  });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body.data, {
    id: invitedAuthUser.id,
    displayName: 'New Admin',
    roleKey: 'viewer',
    role: 'viewer',
    active: false,
    updatedAt: '2026-11-19T00:01:00.000Z'
  });
  assert.equal(rpcCalls.at(-1).name, 'update_admin_profile_with_audit');

  const emptyUpdate = await callApi(`/api/admin/auth/users/${invitedAuthUser.id}`, {
    method: 'PATCH',
    body: JSON.stringify({})
  });
  assert.equal(emptyUpdate.response.status, 400);
});

test('Supabase Auth MFA challenges consume one-time recovery codes', async () => {
  await callApi('/api/admin/auth/logout', { method: 'POST' });
  const login = await callApi('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: authUser.email, password: 'Valid-password-2026!' })
  });
  assert.equal(login.body.mfaState, 'mfa_pending');

  const verified = await callApi('/api/admin/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code: recoveryCodes[0] })
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.authenticated, true);
  assert.ok(db.prepare(`
    SELECT used_at FROM supabase_admin_recovery_codes
    WHERE user_id = ? AND used_at IS NOT NULL
  `).get(authUser.id));

  adminTables.admin_profiles[0].is_active = false;
  const disabled = await callApi('/api/admin/auth/session');
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.body.authenticated, false);
  assert.equal(db.prepare('SELECT session_hash FROM supabase_admin_sessions').all().length, 0);
});

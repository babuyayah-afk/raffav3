const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  createRecoveryCodes,
  createTotpQrCode,
  createTotpSecret,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  findTotpStep,
  hashPassword,
  hashRecoveryCode,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  verifyPassword,
  verifyTotpCode
} = require('./adminAuth');
const db = require('./db');
const { parseFrontendOrigins } = require('./config/env');
const { configureSecurity } = require('./security');
const { validateTestimonial } = require('./validators/testimonialValidator');
const { createWebsiteDataRouter } = require('./routes/websiteDataRoutes');
const { createShowcaseRouter } = require('./routes/showcaseRoutes');
const { createInquiryRouter } = require('./routes/inquiryRoutes');
const { createOperationsRouter } = require('./routes/operationsRoutes');
const { createWebsiteRepository } = require('./repositories/websiteRepository');
const { createShowcaseRepository } = require('./repositories/showcaseRepository');
const { createInquiryRepository } = require('./repositories/inquiryRepository');
const { createOperationsRepository } = require('./repositories/operationsRepository');
const { createInquiryNotifier } = require('./services/inquiryNotifications');
const { createSupabaseAdminAuth } = require('./services/supabaseAdminAuth');

const app = express();
const allowedOrigins = parseFrontendOrigins(process.env.FRONTEND_ORIGINS);
const websiteDataProvider = process.env.WEBSITE_DATA_PROVIDER || 'supabase';
const adminAuthProvider = process.env.ADMIN_AUTH_PROVIDER || 'supabase';
if (!['sqlite', 'supabase'].includes(websiteDataProvider) ||
    !['sqlite', 'supabase'].includes(adminAuthProvider)) {
  throw new Error('WEBSITE_DATA_PROVIDER and ADMIN_AUTH_PROVIDER must be either sqlite or supabase.');
}
const ADMIN_SESSION_COOKIE = 'rafa_admin_session';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_IDLE_TTL_MS = 30 * 60 * 1000;
const ADMIN_STEP_UP_TTL_MS = 5 * 60 * 1000;
const ADMIN_ROLES = new Set(['owner', 'manager', 'support', 'viewer']);
const ADMIN_READ_ROLES = ['owner', 'manager', 'support', 'viewer'];
const ADMIN_MANAGE_ROLES = ['owner', 'manager'];
const ADMIN_STATUS_ROLES = ['owner', 'manager', 'support'];
const MAX_ORDER_REQUEST_TOTAL = 100000000;
let websiteRepository = null;
let supabaseAdminClient = null;
let supabaseAdminAuth = null;
let adminAuthDatabase = null;

// Security + body parsing
configureSecurity(app, allowedOrigins);
app.use('/public/inquiries', express.json({ limit: '8mb' }));
app.use('/api/admin/media', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!isAllowedAdminOrigin(req) ||
      req.get('x-requested-with') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
});

// Rate limit public submissions and protected admin endpoints.
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const celebrationRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const contactInquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const publicInquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' },
  handler(req, res) {
    console.warn('Inquiry submission rate limit exceeded.', { ip: req.ip });
    return res.status(429).json({
      error: { code: 'too_many_requests', message: 'Please try again later.' }
    });
  }
});
const testimonialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const routePath = req.route?.path || req.path;
    return `${req.ip}:${req.method}:${req.baseUrl}${routePath}`;
  }
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const mfaChallengeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const mfaEnrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Please try again later.' }
});
const stepUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many verification attempts. Try again later.' }
});
const userManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

if (websiteDataProvider === 'supabase' || adminAuthProvider === 'supabase') {
  const { createSupabaseAuthClient, getSupabaseAdminClient } = require('./supabaseClients');
  supabaseAdminClient = getSupabaseAdminClient();
  if (adminAuthProvider === 'supabase') {
    adminAuthDatabase = require('./adminAuthDb').openAdminAuthDatabase(db);
    app.locals.adminAuthDatabase = adminAuthDatabase;
    supabaseAdminAuth = createSupabaseAdminAuth({
      db: adminAuthDatabase,
      createAuthClient: () => createSupabaseAuthClient(),
      adminClient: supabaseAdminClient,
      requireAllowedOrigin,
      requireAdmin,
      requireAdminStepUp,
      requireRoles,
      limiters: {
        login: adminLoginLimiter,
        admin: adminLimiter,
        challenge: mfaChallengeLimiter,
        enrollment: mfaEnrollmentLimiter,
        users: userManagementLimiter,
        stepUp: stepUpLimiter
      }
    });
    app.use('/api/admin/auth', supabaseAdminAuth.router);
  }
}

const editableContentKeys = new Set([
  'home.heroCards',
  'home.stats',
  'home.services',
  'home.projects',
  'apparel.catalog',
  'apparel.newsletter'
]);
const contentArrayKeys = new Set([
  'home.stats',
  'home.services',
  'home.projects',
  'apparel.catalog'
]);
const contentArrayLimits = new Map([
  ['home.stats', 4],
  ['home.services', 4],
  ['home.projects', 4],
  ['apparel.catalog', 100]
]);

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readCookie(req, name) {
  const cookieHeader = req.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return '';
}

function setAdminSessionCookie(res, sessionToken) {
  const attributes = [
    `${ADMIN_SESSION_COOKIE}=${sessionToken}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${ADMIN_SESSION_TTL_MS / 1000}`
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/api/admin; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.append('Set-Cookie', attributes.join('; '));
}

function clearAdminSessionCookie(res) {
  const attributes = [
    `${ADMIN_SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
  res.append('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/api/admin; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function getAdminSession(req) {
  const rawSessionId = readCookie(req, ADMIN_SESSION_COOKIE);
  if (!rawSessionId) return null;
  const sessionHash = hashValue(rawSessionId);
  const session = db.prepare(
    `SELECT s.session_hash, s.user_id, s.auth_state, s.expires_at, s.last_seen_at,
            u.username, u.role, u.totp_enabled, u.is_active
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.session_hash = ?`
  ).get(sessionHash);
  if (!session) return null;

  const now = Date.now();
  const expiry = Date.parse(session.expires_at);
  const lastSeen = Date.parse(session.last_seen_at);
  if (!session.is_active || !Number.isFinite(expiry) || expiry <= now ||
      !Number.isFinite(lastSeen) || lastSeen + ADMIN_IDLE_TTL_MS <= now) {
    db.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').run(sessionHash);
    return null;
  }
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE session_hash = ?')
    .run(new Date(now).toISOString(), sessionHash);
  return {
    sessionHash,
    userId: session.user_id,
    authState: session.auth_state,
    expiresAt: session.expires_at,
    user: {
      id: session.user_id,
      username: session.username,
      role: session.role,
      mfaEnabled: Boolean(session.totp_enabled)
    }
  };
}

function requireAllowedOrigin(req, res, next) {
  if (!isAllowedAdminOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function isAllowedAdminOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).origin === `${req.protocol}://${req.get('host')}`;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  (async () => {
    const session = supabaseAdminAuth
      ? await supabaseAdminAuth.getSession(req)
      : getAdminSession(req);
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    if (session.authState !== 'verified' || !session.user.mfaEnabled) {
      return res.status(403).json({ error: 'mfa_required' });
    }
    req.adminSession = session;
    req.adminUser = session.user;
    return next();
  })()
    .catch((error) => {
      console.error('Admin session verification failed:', error);
      return res.status(503).json({ error: 'auth_service_unavailable' });
    });
}

function requireAdminStepUp(req, res, next) {
  const session = req.adminSession;
  if (!session?.sessionHash || !session.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const authDb = adminAuthDatabase || db;
  const grant = authDb.prepare(`
    SELECT user_id, expires_at
    FROM admin_step_up_sessions
    WHERE session_hash = ?
  `).get(session.sessionHash);
  if (!grant || grant.user_id !== session.userId ||
      !Number.isFinite(Date.parse(grant.expires_at)) ||
      Date.parse(grant.expires_at) <= Date.now()) {
    return res.status(403).json({
      error: 'reauthentication_required',
      code: 'reauthentication_required',
      message: 'Verify your password and authenticator code before changing this.'
    });
  }
  return next();
}

const requireStepUpForSensitiveChanges = requireAdminStepUp;

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
    return next();
  };
}

const LEGACY_ROLE_PERMISSIONS = Object.freeze({
  owner: ['content.read', 'content.write', 'media.read', 'media.write', 'inquiries.read', 'inquiries.status.update', 'users.manage'],
  manager: ['content.read', 'content.write', 'media.read', 'media.write', 'inquiries.read', 'inquiries.status.update'],
  support: ['content.read', 'inquiries.read', 'inquiries.status.update'],
  viewer: ['content.read', 'inquiries.read']
});

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = req.adminUser?.permissions ||
      LEGACY_ROLE_PERMISSIONS[req.adminUser?.role] ||
      [];
    if (!permissions.includes(permission)) return res.status(403).json({ error: 'forbidden' });
    return next();
  };
}
function createAdminSession(user, authState, res) {
  const rawSessionId = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO admin_sessions (session_hash, user_id, auth_state, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hashValue(rawSessionId), user.id, authState, nowIso, nowIso, expiresAt);
  setAdminSessionCookie(res, rawSessionId);
  return expiresAt;
}

function rotateAdminSession(session, user, res) {
  const rawSessionId = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').run(session.sessionHash);
    db.prepare(`
      INSERT INTO admin_sessions (session_hash, user_id, auth_state, created_at, last_seen_at, expires_at)
      VALUES (?, ?, 'verified', ?, ?, ?)
    `).run(hashValue(rawSessionId), user.id, nowIso, nowIso, expiresAt);
  })();
  setAdminSessionCookie(res, rawSessionId);
  return expiresAt;
}

function requireVerifiedSession(req, res, authState) {
  const session = getAdminSession(req);
  if (!session || session.authState !== authState) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return session;
}

let dummyPasswordHashPromise;

function getDummyPasswordHash() {
  if (!dummyPasswordHashPromise) dummyPasswordHashPromise = hashPassword(crypto.randomBytes(32).toString('hex'));
  return dummyPasswordHashPromise;
}

function publicAdminUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mfaEnabled: Boolean(user.totp_enabled),
    active: Boolean(user.is_active),
    createdAt: user.created_at
  };
}

async function loginAdmin(req, res) {
  const username = normalizeUsername(req.body?.username);
  const submittedPassword = req.body?.password;
  const validPasswordInput = isValidPassword(submittedPassword);
  const user = isValidUsername(username)
    ? db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username)
    : null;
  try {
    const storedHash = user ? user.password_hash : await getDummyPasswordHash();
    const passwordMatches = await verifyPassword(
      storedHash,
      validPasswordInput ? submittedPassword : 'invalid credential'
    );
    if (!user || !user.is_active || !validPasswordInput || !passwordMatches) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const mfaState = user.totp_enabled ? 'mfa_pending' : 'mfa_setup';
    const expiresAt = createAdminSession(user, mfaState, res);
    return res.json({
      authenticated: false,
      mfaState,
      expiresAt,
      user: publicAdminUser(user)
    });
  } catch (error) {
    console.error('Admin login failed:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
}

function consumeRecoveryCode(userId, code) {
  if (typeof code !== 'string' || code.length > 32) return false;
  const codeHash = hashRecoveryCode(code);
  const row = db.prepare(`
    SELECT id FROM admin_recovery_codes
    WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
  `).get(userId, codeHash);
  if (!row) return false;
  return db.prepare('UPDATE admin_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(new Date().toISOString(), row.id).changes === 1;
}

function parseContentRows(rows) {
  return Object.fromEntries(rows.map((row) => [row.content_key, JSON.parse(row.value_json)]));
}

function readEditableSiteContent() {
  const rows = db.prepare(`
    SELECT content_key, value_json
    FROM site_content
    WHERE content_key != 'home.testimonials'
    ORDER BY content_key
  `).all();
  return rows;
}

function readPublishedTestimonials() {
  return db.prepare(`
    SELECT quote, customer_name AS name, event_detail AS detail
    FROM testimonials
    WHERE status = 'approved'
    ORDER BY reviewed_at DESC, created_at DESC
    LIMIT 12
  `).all();
}

function readPublicSiteContent() {
  return {
    ...parseContentRows(readEditableSiteContent()),
    'home.testimonials': readPublishedTestimonials()
  };
}

function isValidContentValue(key, value) {
  if (contentArrayKeys.has(key)) {
    if (!Array.isArray(value) || value.length > contentArrayLimits.get(key)) return false;
    return value.every((item) => item && typeof item === 'object' && !Array.isArray(item) &&
      Object.values(item).every((field) => typeof field === 'string' || typeof field === 'number' ||
        typeof field === 'boolean' || (Array.isArray(field) && field.every((entry) => typeof entry === 'string'))));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (key === 'home.heroCards') {
    return Object.values(value).every((card) => card && typeof card === 'object' && !Array.isArray(card) &&
      Object.values(card).every((field) => typeof field === 'string' ||
        (Array.isArray(field) && field.length <= 20 && field.every((entry) =>
          typeof entry === 'string' || (entry && typeof entry === 'object' && !Array.isArray(entry) &&
          Object.values(entry).every((text) => typeof text === 'string'))))));
  }
  return Object.values(value).every((field) => typeof field === 'string');
}

function readAdminRecords(table, columns) {
  return db.prepare(`SELECT ${columns} FROM ${table} ORDER BY created_at DESC LIMIT 200`).all();
}

function updateRequestStatus(table, id, status, allowedStatuses) {
  if (typeof status !== 'string' || !allowedStatuses.has(status)) return false;
  const result = db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(status, id);
  return result.changes > 0;
}

// Health probes
app.get(['/health', '/health/live'], (req, res) => res.json({ ok: true }));
app.get('/health/ready', async (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    adminAuthDatabase?.prepare('SELECT 1').get();
    if (websiteRepository) await websiteRepository.checkConnection();
    if (supabaseAdminAuth) await supabaseAdminAuth.checkConnection();
    return res.json({ ok: true });
  } catch (error) {
    console.error('Data store readiness check failed:', error);
    return res.status(503).json({ ok: false });
  }
});

app.use('/api/admin/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/admin/auth/config', adminLimiter, (req, res) =>
  res.json({ provider: 'sqlite', loginField: 'username' }));
app.post('/api/admin/auth/login', adminLoginLimiter, requireAllowedOrigin, loginAdmin);
app.get('/api/admin/auth/session', adminLimiter, (req, res) => {
  const session = getAdminSession(req);
  return res.json({
    authenticated: Boolean(session && session.authState === 'verified' && session.user.mfaEnabled),
    mfaState: session ? session.authState : null,
    expiresAt: session ? session.expiresAt : null,
    user: session ? session.user : null
  });
});
app.post('/api/admin/auth/logout', adminLimiter, requireAllowedOrigin, (req, res) => {
  const session = getAdminSession(req);
  if (session) db.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').run(session.sessionHash);
  clearAdminSessionCookie(res);
  return res.status(204).end();
});
app.post('/api/admin/auth/step-up', stepUpLimiter, requireAllowedOrigin, requireAdmin, async (req, res) => {
  if (!isValidPassword(req.body?.password) ||
      typeof req.body?.code !== 'string' ||
      !/^(?:\d{6}|[A-F0-9]{5}-?[A-F0-9]{5})$/i.test(req.body.code)) {
    return res.status(401).json({ error: 'invalid_reauthentication' });
  }
  try {
    const user = db.prepare(`
      SELECT id, password_hash, totp_secret_enc, totp_enabled, totp_last_step
      FROM admin_users WHERE id = ? AND is_active = 1
    `).get(req.adminSession.userId);
    if (!user || !user.totp_enabled ||
        !await verifyPassword(user.password_hash, req.body.password)) {
      return res.status(401).json({ error: 'invalid_reauthentication' });
    }

    const secret = decryptTotpSecret(user.totp_secret_enc);
    const step = findTotpStep(secret, req.body.code, Date.now(), user.totp_last_step);
    const validRecoveryCode = step === null && consumeRecoveryCode(user.id, req.body.code);
    if (step === null && !validRecoveryCode) {
      return res.status(401).json({ error: 'invalid_reauthentication' });
    }

    const verifiedAt = new Date();
    const expiresAt = new Date(verifiedAt.getTime() + ADMIN_STEP_UP_TTL_MS).toISOString();
    const grantStepUp = db.transaction(() => {
      if (step !== null) {
        db.prepare('UPDATE admin_users SET totp_last_step = ?, updated_at = ? WHERE id = ?')
          .run(step, verifiedAt.toISOString(), user.id);
      }
      db.prepare(`
        INSERT INTO admin_step_up_sessions (session_hash, user_id, verified_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_hash) DO UPDATE SET
          user_id = excluded.user_id,
          verified_at = excluded.verified_at,
          expires_at = excluded.expires_at
      `).run(req.adminSession.sessionHash, user.id, verifiedAt.toISOString(), expiresAt);
    });
    grantStepUp();
    return res.json({ verified: true, expiresAt });
  } catch (error) {
    console.error('Failed to verify administrator step-up authentication:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.post('/api/admin/auth/mfa/setup', mfaEnrollmentLimiter, requireAllowedOrigin, async (req, res) => {
  const session = requireVerifiedSession(req, res, 'mfa_setup');
  if (!session) return;
  const user = db.prepare('SELECT username, totp_secret_enc, totp_enabled FROM admin_users WHERE id = ?')
    .get(session.userId);
  if (!user || user.totp_enabled) return res.status(409).json({ error: 'mfa_already_enabled' });
  try {
    const secret = user.totp_secret_enc
      ? decryptTotpSecret(user.totp_secret_enc)
      : createTotpSecret();
    if (!user.totp_secret_enc) {
      db.prepare('UPDATE admin_users SET totp_secret_enc = ?, updated_at = ? WHERE id = ?')
        .run(encryptTotpSecret(secret), new Date().toISOString(), session.userId);
    }
    const uri = createTotpUri(user.username, secret);
    return res.json({ secret, otpauthUrl: uri, qrCode: await createTotpQrCode(uri) });
  } catch (error) {
    console.error('Failed to initialize authenticator enrollment:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.post('/api/admin/auth/mfa/confirm', mfaEnrollmentLimiter, requireAllowedOrigin, (req, res) => {
  const session = requireVerifiedSession(req, res, 'mfa_setup');
  if (!session) return;
  const user = db.prepare('SELECT id, username, totp_secret_enc, totp_last_step, totp_enabled FROM admin_users WHERE id = ?')
    .get(session.userId);
  if (!user || user.totp_enabled || !user.totp_secret_enc) {
    return res.status(409).json({ error: 'mfa_setup_unavailable' });
  }
  try {
    const secret = decryptTotpSecret(user.totp_secret_enc);
    const step = findTotpStep(secret, req.body?.code, Date.now(), user.totp_last_step);
    if (step === null) return res.status(422).json({ error: 'invalid_mfa_code' });

    const recoveryCodes = createRecoveryCodes();
    const createdAt = new Date().toISOString();
    const saveMfa = db.transaction(() => {
      db.prepare(`
        UPDATE admin_users
        SET totp_enabled = 1, totp_last_step = ?, updated_at = ?
        WHERE id = ?
      `).run(step, createdAt, user.id);
      db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ?').run(user.id);
      const insert = db.prepare(`
        INSERT INTO admin_recovery_codes (id, user_id, code_hash, created_at)
        VALUES (?, ?, ?, ?)
      `);
      recoveryCodes.forEach((code) =>
        insert.run(crypto.randomUUID(), user.id, hashRecoveryCode(code), createdAt)
      );
    });
    saveMfa();
    const expiresAt = rotateAdminSession(session, user, res);
    return res.json({ mfaEnabled: true, recoveryCodes, expiresAt });
  } catch (error) {
    console.error('Failed to enable authenticator MFA:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.post('/api/admin/auth/mfa/verify', mfaChallengeLimiter, requireAllowedOrigin, (req, res) => {
  const session = requireVerifiedSession(req, res, 'mfa_pending');
  if (!session) return;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1')
    .get(session.userId);
  if (!user || !user.totp_enabled || !user.totp_secret_enc) {
    return res.status(401).json({ error: 'invalid_mfa_code' });
  }
  try {
    const secret = decryptTotpSecret(user.totp_secret_enc);
    const step = findTotpStep(secret, req.body?.code, Date.now(), user.totp_last_step);
    const valid = step !== null || consumeRecoveryCode(user.id, req.body?.code);
    if (!valid) return res.status(401).json({ error: 'invalid_mfa_code' });
    if (step !== null) {
      db.prepare('UPDATE admin_users SET totp_last_step = ?, updated_at = ? WHERE id = ?')
        .run(step, new Date().toISOString(), user.id);
    }
    const expiresAt = rotateAdminSession(session, user, res);
    return res.json({
      authenticated: true,
      expiresAt,
      user: { id: user.id, username: user.username, role: user.role, mfaEnabled: true }
    });
  } catch (error) {
    console.error('Failed to verify authenticator challenge:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.get('/api/admin/auth/users', adminLimiter, requireAdmin, requireRoles('owner'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, role, totp_enabled, is_active, created_at
      FROM admin_users ORDER BY username
    `).all();
    return res.json({ users: users.map(publicAdminUser) });
  } catch (error) {
    console.error('Failed to read admin accounts:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.post('/api/admin/auth/users', userManagementLimiter, requireAdmin, requireRoles('owner'),
  requireStepUpForSensitiveChanges, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const role = req.body?.role;
  if (!isValidUsername(username) || !isValidPassword(password) || !ADMIN_ROLES.has(role)) {
    return res.status(422).json({
      error: 'validation_failed',
      message: 'Provide a valid username, a 12–128 character password, and an allowed role.'
    });
  }
  const now = new Date().toISOString();
  try {
    const user = {
      id: crypto.randomUUID(),
      username,
      role,
      totp_enabled: 0,
      is_active: 1,
      created_at: now
    };
    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, username, await hashPassword(password), role, now, now);
    return res.status(201).json({ user: publicAdminUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'username_unavailable' });
    }
    console.error('Failed to create admin account:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
app.patch('/api/admin/auth/users/:id', userManagementLimiter, requireAdmin, requireRoles('owner'),
  requireStepUpForSensitiveChanges, (req, res) => {
  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const role = req.body?.role === undefined ? existing.role : req.body.role;
  const isActive = req.body?.isActive === undefined ? Boolean(existing.is_active) : req.body.isActive;
  const resetMfa = req.body?.resetMfa === true;
  if (!ADMIN_ROLES.has(role) || typeof isActive !== 'boolean' ||
      (req.body?.resetMfa !== undefined && typeof req.body.resetMfa !== 'boolean') ||
      (req.body?.role === undefined && req.body?.isActive === undefined && !resetMfa)) {
    return res.status(422).json({ error: 'validation_failed' });
  }
  const removesActiveOwner = existing.role === 'owner' && existing.is_active &&
    (role !== 'owner' || !isActive);
  if (removesActiveOwner) {
    const activeOwners = db.prepare(
      "SELECT COUNT(*) AS count FROM admin_users WHERE role = 'owner' AND is_active = 1"
    ).get().count;
    if (activeOwners <= 1) return res.status(409).json({ error: 'last_owner_required' });
  }
  if (existing.id === req.adminUser.id &&
      (role !== existing.role || !isActive || resetMfa)) {
    return res.status(409).json({ error: 'cannot_modify_current_account' });
  }

  const updatedAt = new Date().toISOString();
  try {
    const updateUser = db.transaction(() => {
      db.prepare(`
        UPDATE admin_users
        SET role = ?, is_active = ?, totp_enabled = ?, totp_secret_enc = ?,
            totp_last_step = ?, updated_at = ?
        WHERE id = ?
      `).run(
        role,
        isActive ? 1 : 0,
        resetMfa ? 0 : existing.totp_enabled,
        resetMfa ? null : existing.totp_secret_enc,
        resetMfa ? -1 : existing.totp_last_step,
        updatedAt,
        existing.id
      );
      if (resetMfa) db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ?').run(existing.id);
      if (!isActive || role !== existing.role || resetMfa) {
        db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(existing.id);
      }
    });
    updateUser();
    const updated = db.prepare(`
      SELECT id, username, role, totp_enabled, is_active, created_at
      FROM admin_users WHERE id = ?
    `).get(existing.id);
    return res.json({ user: publicAdminUser(updated) });
  } catch (error) {
    console.error('Failed to update admin account:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Validation helpers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateOrderRequest(body) {
  const errors = [];
  const b = body || {};

  if (typeof b.customer_name !== 'string' || b.customer_name.trim().length < 2) {
    errors.push('customer_name is required (min 2 chars)');
  }
  if (typeof b.customer_email !== 'string' || !EMAIL_RE.test(b.customer_email)) {
    errors.push('customer_email must be a valid email');
  }
  if (b.customer_phone != null && typeof b.customer_phone !== 'string') {
    errors.push('customer_phone must be a string');
  }
  if (b.preferred_date != null && typeof b.preferred_date !== 'string') {
    errors.push('preferred_date must be a string');
  }
  if (b.notes != null && typeof b.notes !== 'string') {
    errors.push('notes must be a string');
  }
  if (b.total != null && (!Number.isSafeInteger(b.total) || b.total < 0 || b.total > MAX_ORDER_REQUEST_TOTAL)) {
    errors.push('total must be a non-negative integer amount in KES');
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    b.items.forEach((it, i) => {
      if (!it || typeof it.name !== 'string' || !it.name.trim()) {
        errors.push(`items[${i}].name is required`);
      }
      if (!Number.isSafeInteger(it.qty) || it.qty < 1) {
        errors.push(`items[${i}].qty must be a positive integer`);
      }
      if (!Number.isSafeInteger(it.price) || it.price < 0) {
        errors.push(`items[${i}].price must be a non-negative integer (cents)`);
      }
    });
  }

  return errors;
}

if (websiteDataProvider === 'supabase') {
  websiteRepository = createWebsiteRepository(supabaseAdminClient);
  const showcaseRepository = createShowcaseRepository(supabaseAdminClient);
  const inquiryRepository = createInquiryRepository(supabaseAdminClient);
  const operationsRepository = createOperationsRepository(supabaseAdminClient);
  const inquiryNotifier = createInquiryNotifier({ repository: inquiryRepository });
  app.locals.inquiryWorker = inquiryNotifier;
  app.use(createWebsiteDataRouter({
    repository: websiteRepository,
    showcaseRepository,
    limiters: {
      order: orderLimiter,
      celebration: celebrationRequestLimiter,
      contactInquiry: contactInquiryLimiter,
      testimonial: testimonialLimiter,
      newsletter: newsletterLimiter,
      admin: adminLimiter
    },
    requireAdmin,
    requirePermission,
    validateOrderRequest,
    editableContentKeys,
    isValidContentValue
  }));
  app.use(createShowcaseRouter({
    repository: showcaseRepository,
    limiters: { admin: adminLimiter },
    requireAdmin,
    requirePermission
  }));
  app.use(createInquiryRouter({
    repository: inquiryRepository,
    notifier: inquiryNotifier,
    limiters: {
      publicInquiry: publicInquiryLimiter,
      admin: adminLimiter
    },
    requireAdmin,
    requirePermission
  }));
  app.use(createOperationsRouter({
    repository: operationsRepository,
    limiters: { admin: adminLimiter },
    requireAdmin,
    requirePermission,
    requireAdminStepUp
  }));
}

// POST /api/order-requests
app.post('/api/order-requests', orderLimiter, (req, res) => {
  const errors = validateOrderRequest(req.body);
  if (errors.length) {
    return res.status(400).json({ error: 'validation_failed', details: errors });
  }

  const {
    customer_name,
    customer_email,
    customer_phone = null,
    preferred_date = null,
    notes = null,
    items,
  } = req.body;

  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  if (!Number.isSafeInteger(total) || total > MAX_ORDER_REQUEST_TOTAL) {
    return res.status(400).json({
      error: 'validation_failed',
      details: ['item estimate must be a safe integer within the supported range']
    });
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO order_requests
        (id, created_at, customer_name, customer_email, customer_phone,
         preferred_date, notes, items_json, total, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(
      id,
      created_at,
      customer_name.trim(),
      customer_email.trim().toLowerCase(),
      customer_phone,
      preferred_date,
      notes,
      JSON.stringify(items),
      total
    );

    return res.status(201).json({ id, created_at, total, total_is_estimate: true, status: 'pending' });
  } catch (err) {
    console.error('Failed to insert order request:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/celebration-requests', celebrationRequestLimiter, (req, res) => {
  console.warn('Deprecated public celebration submission rejected.', { ip: req.ip });
  return res.status(410).json({
    error: 'endpoint_moved',
    message: 'Use the protected public inquiry form to contact RAFA.'
  });
});

app.post('/api/contact-inquiries', contactInquiryLimiter, (req, res) => {
  console.warn('Deprecated public contact submission rejected.', { ip: req.ip });
  return res.status(410).json({
    error: 'endpoint_moved',
    message: 'Use the protected public inquiry form to contact RAFA.'
  });
});

app.post('/api/testimonials', testimonialLimiter, (req, res) => {
  const { errors, value } = validateTestimonial(req.body);
  if (errors) {
    return res.status(422).json({ error: 'validation_failed', details: errors });
  }

  const id = `testimonial-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO testimonials
        (id, created_at, customer_name, quote, event_detail, consent_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, createdAt, value.name, value.quote, value.detail, createdAt);
    return res.status(201).json({ id, status: 'pending' });
  } catch (error) {
    console.error('Failed to insert testimonial submission:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Unable to save the testimonial.' });
  }
});

app.get('/api/site-content', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json({ content: readPublicSiteContent() });
  } catch (error) {
    console.error('Failed to read public site content:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/newsletter-subscriptions', newsletterLimiter, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(422).json({ error: 'validation_failed', message: 'Enter a valid email address.' });
  }
  try {
    const existing = db.prepare('SELECT id FROM newsletter_subscriptions WHERE email = ?').get(email);
    if (existing) return res.status(200).json({ id: existing.id, status: 'active', duplicate: true });
    const id = `newsletter-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO newsletter_subscriptions (id, created_at, email) VALUES (?, ?, ?)')
      .run(id, new Date().toISOString(), email);
    return res.status(201).json({ id, status: 'active', duplicate: false });
  } catch (error) {
    console.error('Failed to save newsletter subscription:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Unable to save the subscription.' });
  }
});

app.get('/api/admin/site-content', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT content_key, value_json, updated_at
      FROM site_content
      WHERE content_key != 'home.testimonials'
      ORDER BY content_key
    `).all();
    return res.json({
      content: parseContentRows(rows),
      updatedAt: Object.fromEntries(rows.map((row) => [row.content_key, row.updated_at]))
    });
  } catch (error) {
    console.error('Failed to read admin site content:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/admin/testimonials', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  const status = req.query.status === undefined ? 'pending' : req.query.status;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(422).json({ error: 'validation_failed', message: 'Unsupported testimonial status.' });
  }
  try {
    const items = db.prepare(`
      SELECT id, created_at AS createdAt, customer_name AS name, quote,
        event_detail AS detail, status
      FROM testimonials
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(status);
    return res.json({ items });
  } catch (error) {
    console.error('Failed to read testimonial submissions:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/admin/testimonials/:id', adminLimiter, requireAdmin,
  requireRoles(...ADMIN_MANAGE_ROLES), requireStepUpForSensitiveChanges, (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(422).json({ error: 'validation_failed', message: 'Choose approve or reject.' });
  }
  const reviewedAt = new Date().toISOString();
  try {
    const result = db.prepare(`
      UPDATE testimonials
      SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(status, reviewedAt, req.adminUser.id, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'not_found_or_already_reviewed' });
    return res.json({ id: req.params.id, status, reviewedAt });
  } catch (error) {
    console.error('Failed to review testimonial submission:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.put('/api/admin/site-content/:key', adminLimiter, requireAdmin, requireRoles(...ADMIN_MANAGE_ROLES), (req, res) => {
  const key = req.params.key;
  const value = req.body?.value;
  if (!editableContentKeys.has(key) || !isValidContentValue(key, value) ||
      JSON.stringify(value).length > 50000) {
    return res.status(422).json({ error: 'validation_failed', message: 'This content is invalid or too large.' });
  }
  if (JSON.stringify(value).includes('\u0000')) {
    return res.status(422).json({ error: 'validation_failed', message: 'Content contains an invalid character.' });
  }
  try {
    const updatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO site_content (content_key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(content_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), updatedAt);
    return res.json({ key, value, updatedAt });
  } catch (error) {
    console.error(`Failed to save site content "${key}":`, error);
    return res.status(500).json({ error: 'internal_error', message: 'Unable to save site content.' });
  }
});

app.get('/api/admin/contact-inquiries', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  try {
    const rows = readAdminRecords('contact_inquiries',
      'id, created_at AS createdAt, topic, customer_name AS name, customer_email AS email, customer_phone AS phone, details_json, status');
    return res.json({ items: rows.map(({ details_json, ...item }) => ({ ...item, details: JSON.parse(details_json) })) });
  } catch (error) {
    console.error('Failed to read contact inquiries:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/admin/contact-inquiries/:id', adminLimiter, requireAdmin, requireRoles(...ADMIN_STATUS_ROLES), (req, res) => {
  try {
    const updated = updateRequestStatus('contact_inquiries', req.params.id, req.body?.status,
      new Set(['new', 'reviewed', 'responded', 'closed']));
    if (!updated) return res.status(404).json({ error: 'not_found_or_invalid_status' });
    return res.json({ id: req.params.id, status: req.body.status });
  } catch (error) {
    console.error('Failed to update contact inquiry:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/admin/celebration-requests', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  try {
    const rows = readAdminRecords('celebration_requests',
      'id, created_at AS createdAt, customer_name AS name, customer_email AS email, customer_phone AS phone, occasion, event_date AS eventDate, event_location AS location, guest_count AS guestCount, budget, notes, selections_json, status');
    return res.json({ items: rows.map(({ selections_json, ...item }) => ({ ...item, selections: JSON.parse(selections_json) })) });
  } catch (error) {
    console.error('Failed to read event inquiries:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/admin/celebration-requests/:id', adminLimiter, requireAdmin, requireRoles(...ADMIN_STATUS_ROLES), (req, res) => {
  try {
    const updated = updateRequestStatus('celebration_requests', req.params.id, req.body?.status,
      new Set(['new', 'reviewed', 'responded', 'closed']));
    if (!updated) return res.status(404).json({ error: 'not_found_or_invalid_status' });
    return res.json({ id: req.params.id, status: req.body.status });
  } catch (error) {
    console.error('Failed to update event inquiry:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/admin/order-requests', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  try {
    const rows = readAdminRecords('order_requests',
      'id, created_at AS createdAt, customer_name AS name, customer_email AS email, customer_phone AS phone, preferred_date AS preferredDate, notes, items_json, total, status');
    return res.json({
      items: rows.map(({ items_json, ...item }) => ({
        ...item,
        items: JSON.parse(items_json),
        total_is_estimate: true
      }))
    });
  } catch (error) {
    console.error('Failed to read dessert orders:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/admin/order-requests/:id', adminLimiter, requireAdmin, requireRoles(...ADMIN_STATUS_ROLES), (req, res) => {
  try {
    const updated = updateRequestStatus('order_requests', req.params.id, req.body?.status,
      new Set(['pending', 'reviewed', 'preparing', 'ready', 'completed', 'cancelled']));
    if (!updated) return res.status(404).json({ error: 'not_found_or_invalid_status' });
    return res.json({ id: req.params.id, status: req.body.status });
  } catch (error) {
    console.error('Failed to update dessert order:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/admin/newsletter-subscriptions', adminLimiter, requireAdmin, requireRoles(...ADMIN_READ_ROLES), (req, res) => {
  try {
    return res.json({ items: readAdminRecords('newsletter_subscriptions', 'id, created_at AS createdAt, email, status') });
  } catch (error) {
    console.error('Failed to read newsletter subscriptions:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/admin/newsletter-subscriptions/:id', adminLimiter, requireAdmin, requireRoles(...ADMIN_STATUS_ROLES), (req, res) => {
  try {
    const updated = updateRequestStatus('newsletter_subscriptions', req.params.id, req.body?.status,
      new Set(['active', 'unsubscribed']));
    if (!updated) return res.status(404).json({ error: 'not_found_or_invalid_status' });
    return res.json({ id: req.params.id, status: req.body.status });
  } catch (error) {
    console.error('Failed to update newsletter subscription:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

const adminDirectory = path.resolve(__dirname, '../../admin');
const adminLoginAsset = (file) => (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  return res.sendFile(path.join(adminDirectory, file), (error) => {
    if (error) next(error);
  });
};

function requireAdminPage(req, res, next) {
  const rawSessionToken = readCookie(req, ADMIN_SESSION_COOKIE);
  if (!rawSessionToken) return res.redirect(302, '/admin/login');
  const sessionHash = hashValue(rawSessionToken);
  try {
    let active = false;
    if (adminAuthProvider === 'supabase') {
      const session = adminAuthDatabase.prepare(`
        SELECT sessions.user_id, sessions.last_seen_at, sessions.expires_at,
          security.totp_enabled
        FROM supabase_admin_sessions AS sessions
        JOIN supabase_admin_security AS security ON security.user_id = sessions.user_id
        WHERE sessions.session_hash = ?
          AND sessions.auth_state = 'verified'
      `).get(sessionHash);
      const lastSeen = Date.parse(session?.last_seen_at);
      const expiry = Date.parse(session?.expires_at);
      active = Boolean(session?.totp_enabled && Number.isFinite(lastSeen) &&
        Number.isFinite(expiry) && lastSeen + ADMIN_IDLE_TTL_MS > Date.now() &&
        expiry > Date.now());
      if (active) {
        adminAuthDatabase.prepare(
          'UPDATE supabase_admin_sessions SET last_seen_at = ? WHERE session_hash = ?'
        ).run(new Date().toISOString(), sessionHash);
      }
    } else {
      const session = getAdminSession(req);
      active = Boolean(session && session.authState === 'verified' && session.user.mfaEnabled);
    }
    if (!active) return res.redirect(302, '/admin/login');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return next();
  } catch (error) {
    console.error('Unable to verify admin page session:', error);
    return res.status(503).type('text').send('Administrator sign-in is temporarily unavailable.');
  }
}

function requireVerifiedAdminDocument(req, res, next) {
  (async () => {
    const session = supabaseAdminAuth
      ? await supabaseAdminAuth.getSession(req)
      : getAdminSession(req);
    if (!session || session.authState !== 'verified' || !session.user.mfaEnabled) {
      return res.redirect(302, '/admin/login');
    }
    return requireAdminPage(req, res, next);
  })().catch((error) => {
    console.error('Unable to verify administrator access to the dashboard:', error);
    return res.status(503).type('text').send('Administrator sign-in is temporarily unavailable.');
  });
}

app.get('/admin/login', adminLoginAsset('login.html'));
app.get('/admin/login.css', adminLoginAsset('login.css'));
app.get('/admin/login.js', adminLoginAsset('login.js'));
app.get(['/admin', '/admin/'], requireVerifiedAdminDocument, (req, res) =>
  res.sendFile(path.join(adminDirectory, 'index.html')));
app.get('/admin/index.html', requireVerifiedAdminDocument, (req, res) =>
  res.sendFile(path.join(adminDirectory, 'index.html')));
app.use('/admin', requireAdminPage, express.static(adminDirectory, {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
}));

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

module.exports = app;

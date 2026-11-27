'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const {
  createRecoveryCodes,
  createTotpQrCode,
  createTotpSecret,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  findTotpStep,
  hashRecoveryCode
} = require('../adminAuth');

const SESSION_COOKIE = 'rafa_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const IDLE_TTL_MS = 30 * 60 * 1000;
const STEP_UP_TTL_MS = 5 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_KEYS = Object.freeze({
  admin: 'owner',
  manager: 'manager',
  inquiry_staff: 'support',
  catalogue_staff: 'catalogue_staff',
  viewer: 'viewer'
});
const adminRoleKeySchema = z.enum(Object.keys(ROLE_KEYS));
const userListQuerySchema = z.object({
  page: z.preprocess(
    (value) => value === undefined ? 1 :
      typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value,
    z.number().int().min(1).max(10000)
  ),
  limit: z.preprocess(
    (value) => value === undefined ? 25 :
      typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value,
    z.number().int().min(1).max(50)
  )
}).strict();
const stepUpSchema = z.object({
  password: z.string().min(12).max(128),
  code: z.string().trim().regex(
    /^(?:\d{6}|[A-Z0-9]{5}-[A-Z0-9]{5})$/,
    'Enter a 6-digit authenticator code or a recovery code in XXXXX-XXXXX format.'
  )
}).strict();
const inviteAdminUserSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  displayName: z.string().trim().min(1).max(120).regex(
    /^[^<>{}\u0000-\u001F\u007F]+$/,
    'Display name cannot contain HTML, braces, or control characters.'
  ),
  roleKey: adminRoleKeySchema
}).strict();
const updateAdminUserParamsSchema = z.object({ id: z.string().uuid() }).strict();
const updateAdminUserBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120).regex(
    /^[^<>{}\u0000-\u001F\u007F]+$/,
    'Display name cannot contain HTML, braces, or control characters.'
  ).optional(),
  roleKey: adminRoleKeySchema.optional(),
  active: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);
const adminLoginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128)
}).strict();
const mfaConfirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Authenticator code must contain exactly 6 digits.')
}).strict();
const mfaVerifySchema = z.object({
  code: z.string().trim().regex(
    /^(?:\d{6}|[A-Z0-9]{5}-[A-Z0-9]{5})$/,
    'Enter a 6-digit authenticator code or a recovery code in XXXXX-XXXXX format.'
  ).max(11)
}).strict();

function getUserManagementError(error) {
  if (['email_exists', 'user_already_exists', '23505'].includes(error?.code)) {
    return {
      status: 409,
      code: 'user_already_exists',
      message: 'An account with this email already exists.'
    };
  }
  if (error?.code === '42501') {
    return { status: 403, code: 'forbidden', message: 'This account change is not allowed.' };
  }
  if (error?.code === 'P0002') {
    return { status: 404, code: 'user_not_found', message: 'The administrator account was not found.' };
  }
  if (error?.code === '23514') {
    return {
      status: 409,
      code: 'last_active_admin',
      message: 'The last active admin cannot be demoted or deactivated.'
    };
  }
  if (['22023', '23503'].includes(error?.code)) {
    return { status: 400, code: 'invalid_profile', message: 'The administrator profile is invalid.' };
  }
  if (error?.status === 429) {
    return { status: 429, code: 'invite_rate_limited', message: 'Too many invitations; try again later.' };
  }
  return {
    status: 503,
    code: 'user_management_unavailable',
    message: 'Administrator management is temporarily unavailable.'
  };
}

async function verifyStepUp(req, res, { db, createAuthClient, now, logger }) {
  const parsed = stepUpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'invalid_step_up',
      message: 'Enter your current password and a valid authenticator or recovery code.'
    });
  }

  const session = req.adminSession;
  const authClient = createAuthClient();
  const passwordResult = await authClient.auth.signInWithPassword({
    email: session.user.email,
    password: parsed.data.password
  });
  let security;
  let recoveryCodeId = null;
  let step = null;
  let valid = Boolean(!passwordResult.error &&
    passwordResult.data?.user?.id === session.userId &&
    passwordResult.data?.session);
  try {
    if (valid) {
      security = db.prepare(`
        SELECT totp_secret_enc, totp_enabled, totp_last_step
        FROM supabase_admin_security
        WHERE user_id = ?
      `).get(session.userId);
      if (!security?.totp_enabled || !security.totp_secret_enc) {
        valid = false;
      } else {
        step = findTotpStep(
          decryptTotpSecret(security.totp_secret_enc),
          parsed.data.code,
          now().getTime(),
          security.totp_last_step
        );
        if (step === null) {
          const codeHash = hashRecoveryCode(parsed.data.code);
          recoveryCodeId = db.prepare(`
            SELECT id FROM supabase_admin_recovery_codes
            WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
          `).get(session.userId, codeHash)?.id || null;
          valid = Boolean(recoveryCodeId);
        }
      }
    }
  } finally {
    if (passwordResult.data?.session) {
      const signOutResult = await authClient.auth.signOut({ scope: 'local' });
      if (signOutResult.error) {
        logger.error('Failed to clear temporary step-up Supabase session:', signOutResult.error);
        throw new Error('Temporary step-up session could not be cleared.');
      }
    }
  }
  if (!valid) return res.status(401).json({ error: 'invalid_step_up_credentials' });

  const verifiedAt = now();
  const expiresAt = new Date(verifiedAt.getTime() + STEP_UP_TTL_MS).toISOString();
  db.transaction(() => {
    if (step !== null) {
      const updated = db.prepare(`
        UPDATE supabase_admin_security
        SET totp_last_step = ?, updated_at = ?
        WHERE user_id = ? AND totp_last_step < ?
      `).run(step, verifiedAt.toISOString(), session.userId, step);
      if (updated.changes !== 1) throw new Error('Authenticator code was already used.');
    } else {
      const consumed = db.prepare(`
        UPDATE supabase_admin_recovery_codes
        SET used_at = ?
        WHERE id = ? AND used_at IS NULL
      `).run(verifiedAt.toISOString(), recoveryCodeId);
      if (consumed.changes !== 1) throw new Error('Recovery code was already used.');
    }
    db.prepare(`
      INSERT INTO admin_step_up_sessions (session_hash, user_id, verified_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_hash) DO UPDATE SET
        user_id = excluded.user_id,
        verified_at = excluded.verified_at,
        expires_at = excluded.expires_at
    `).run(session.sessionHash, session.userId, verifiedAt.toISOString(), expiresAt);
  })();

  return res.json({ verified: true, expiresAt });
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isExpiredAuthError(error) {
  return error && [400, 401, 403].includes(error.status);
}

function createSupabaseAdminAuth({
  db,
  createAuthClient,
  adminClient,
  requireAllowedOrigin,
  requireAdmin,
  requireRoles,
  requireAdminStepUp,
  limiters,
  logger = console,
  now = () => new Date(),
  nodeEnv = process.env.NODE_ENV
}) {
  if (!db || typeof createAuthClient !== 'function' ||
      typeof adminClient?.from !== 'function' ||
      typeof requireAllowedOrigin !== 'function' ||
      typeof requireAdmin !== 'function' ||
      typeof requireAdminStepUp !== 'function' ||
      typeof requireRoles !== 'function' ||
      !limiters) {
    throw new TypeError('Supabase admin auth requires database, Supabase clients, and API middleware.');
  }

  function setSessionCookie(res, sessionToken) {
    const attributes = [
      `${SESSION_COOKIE}=${sessionToken}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      `Max-Age=${SESSION_TTL_MS / 1000}`
    ];
    if (nodeEnv === 'production') attributes.push('Secure');
    res.append('Set-Cookie', attributes.join('; '));
  }

  function clearSessionCookie(res) {
    const attributes = [
      `${SESSION_COOKIE}=`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ];
    if (nodeEnv === 'production') attributes.push('Secure');
    res.append('Set-Cookie', attributes.join('; '));
  }

  async function loadProfile(userId) {
    const profileResult = await adminClient.from('admin_profiles')
      .select('id,display_name,role_key,is_active')
      .eq('id', userId)
      .maybeSingle();
    if (profileResult.error) {
      const error = new Error(`Supabase admin profile lookup failed: ${profileResult.error.message}`);
      error.cause = profileResult.error;
      throw error;
    }

    const profile = profileResult.data;
    if (!profile || !profile.is_active || !ROLE_KEYS[profile.role_key]) return null;

    const permissionResult = await adminClient.from('role_permissions')
      .select('permission_key')
      .eq('role_key', profile.role_key);
    if (permissionResult.error) {
      const error = new Error(`Supabase admin permissions lookup failed: ${permissionResult.error.message}`);
      error.cause = permissionResult.error;
      throw error;
    }
    return {
      ...profile,
      role: ROLE_KEYS[profile.role_key],
      permissions: (permissionResult.data || []).map((row) => row.permission_key)
    };
  }

  async function checkConnection() {
    const result = await adminClient.from('roles')
      .select('role_key')
      .limit(1);
    if (result.error) {
      const error = new Error(`Supabase auth readiness check failed: ${result.error.message}`);
      error.cause = result.error;
      throw error;
    }
  }

  function readSessionToken(req) {
    const cookieHeader = req.get('cookie') || '';
    for (const part of cookieHeader.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
      return part.slice(separator + 1).trim();
    }
    return '';
  }

  async function getSession(req) {
    const rawSessionToken = readSessionToken(req);
    if (!rawSessionToken) return null;
    const sessionHash = hashValue(rawSessionToken);
    const row = db.prepare(`
      SELECT session_hash, user_id, auth_state, tokens_enc, created_at, last_seen_at, expires_at
      FROM supabase_admin_sessions
      WHERE session_hash = ?
    `).get(sessionHash);
    if (!row) return null;

    const currentTime = now().getTime();
    const expiresAt = Date.parse(row.expires_at);
    const lastSeenAt = Date.parse(row.last_seen_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= currentTime ||
        !Number.isFinite(lastSeenAt) || lastSeenAt + IDLE_TTL_MS <= currentTime) {
      db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?').run(sessionHash);
      return null;
    }

    let tokens;
    try {
      tokens = JSON.parse(decryptTotpSecret(row.tokens_enc));
    } catch (error) {
      logger.error('Stored Supabase admin session could not be decrypted:', error);
      db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?').run(sessionHash);
      return null;
    }

    const authClient = createAuthClient();
    const sessionResult = await authClient.auth.setSession(tokens);
    if (sessionResult.error && !isExpiredAuthError(sessionResult.error)) {
      throw sessionResult.error;
    }
    if (sessionResult.error || !sessionResult.data.session) {
      db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?').run(sessionHash);
      return null;
    }
    const userResult = await authClient.auth.getUser();
    if (userResult.error && !isExpiredAuthError(userResult.error)) {
      throw userResult.error;
    }
    if (userResult.error || !userResult.data.user || userResult.data.user.id !== row.user_id) {
      db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?').run(sessionHash);
      return null;
    }

    const profile = await loadProfile(row.user_id);
    if (!profile) {
      db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?').run(sessionHash);
      return null;
    }
    const security = db.prepare(`
      SELECT totp_enabled
      FROM supabase_admin_security
      WHERE user_id = ?
    `).get(row.user_id);

    const updatedAt = now().toISOString();
    const activeSession = sessionResult.data.session;
    db.prepare(`
      UPDATE supabase_admin_sessions
      SET tokens_enc = ?, last_seen_at = ?
      WHERE session_hash = ?
    `).run(encryptTotpSecret(JSON.stringify({
      access_token: activeSession.access_token,
      refresh_token: activeSession.refresh_token
    })), updatedAt, sessionHash);

    const user = {
      id: userResult.data.user.id,
      email: userResult.data.user.email || '',
      username: userResult.data.user.email || '',
      displayName: profile.display_name,
      role: profile.role,
      permissions: profile.permissions,
      mfaEnabled: Boolean(security?.totp_enabled)
    };
    return {
      sessionHash,
      userId: row.user_id,
      authState: row.auth_state,
      expiresAt: row.expires_at,
      user,
      authClient,
      authSession: activeSession
    };
  }

  async function startSession(user, authSession, mfaEnabled, res) {
    const rawSessionToken = crypto.randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString();
    const authState = mfaEnabled ? 'mfa_pending' : 'mfa_setup';
    db.prepare(`
      INSERT INTO supabase_admin_sessions
        (session_hash, user_id, auth_state, tokens_enc, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      hashValue(rawSessionToken),
      user.id,
      authState,
      encryptTotpSecret(JSON.stringify({
        access_token: authSession.access_token,
        refresh_token: authSession.refresh_token
      })),
      createdAt.toISOString(),
      createdAt.toISOString(),
      expiresAt
    );
    setSessionCookie(res, rawSessionToken);
    return { authState, expiresAt };
  }

  function prepareVerifiedSession(session) {
    const rawSessionToken = crypto.randomBytes(32).toString('base64url');
    const createdAt = now();
    return {
      rawSessionToken,
      sessionHash: hashValue(rawSessionToken),
      tokensEnc: encryptTotpSecret(JSON.stringify({
        access_token: session.authSession.access_token,
        refresh_token: session.authSession.refresh_token
      })),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString()
    };
  }

  function persistVerifiedSession(session, rotation) {
    db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?')
      .run(session.sessionHash);
    db.prepare('DELETE FROM admin_step_up_sessions WHERE session_hash = ?')
      .run(session.sessionHash);
    db.prepare(`
      INSERT INTO supabase_admin_sessions
        (session_hash, user_id, auth_state, tokens_enc, created_at, last_seen_at, expires_at)
      VALUES (?, ?, 'verified', ?, ?, ?, ?)
    `).run(
      rotation.sessionHash,
      session.userId,
      rotation.tokensEnc,
      rotation.createdAt,
      rotation.createdAt,
      rotation.expiresAt
    );
  }

  async function requireMfaState(req, res, expectedState) {
    const session = await getSession(req);
    if (!session) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    if (session.authState !== expectedState) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    return session;
  }

  async function login(req, res) {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const { email, password } = parsed.data;

    const authClient = createAuthClient();
    const result = await authClient.auth.signInWithPassword({ email, password });
    if (result.error && !isExpiredAuthError(result.error)) throw result.error;
    if (result.error || !result.data.user || !result.data.session) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const profile = await loadProfile(result.data.user.id);
    if (!profile) {
      const signOutResult = await authClient.auth.signOut({ scope: 'local' });
      if (signOutResult.error) logger.error('Failed to clear non-admin Supabase login:', signOutResult.error);
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const security = db.prepare(`
      SELECT totp_enabled
      FROM supabase_admin_security
      WHERE user_id = ?
    `).get(result.data.user.id);
    const session = await startSession(
      result.data.user,
      result.data.session,
      Boolean(security?.totp_enabled),
      res
    );
    return res.json({
      authenticated: false,
      mfaState: session.authState,
      expiresAt: session.expiresAt,
      user: {
        id: result.data.user.id,
        username: result.data.user.email || email,
        email: result.data.user.email || email,
        role: profile.role,
        mfaEnabled: Boolean(security?.totp_enabled)
      }
    });
  }

  async function setupMfa(req, res) {
    const session = await requireMfaState(req, res, 'mfa_setup');
    if (!session) return;
    const security = db.prepare(`
      SELECT totp_secret_enc, totp_enabled
      FROM supabase_admin_security
      WHERE user_id = ?
    `).get(session.userId);
    if (security?.totp_enabled) return res.status(409).json({ error: 'mfa_already_enabled' });

    const secret = security?.totp_secret_enc
      ? decryptTotpSecret(security.totp_secret_enc)
      : createTotpSecret();
    const updatedAt = now().toISOString();
    db.prepare(`
      INSERT INTO supabase_admin_security
        (user_id, totp_secret_enc, totp_enabled, totp_last_step, created_at, updated_at)
      VALUES (?, ?, 0, -1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        totp_secret_enc = excluded.totp_secret_enc,
        updated_at = excluded.updated_at
    `).run(session.userId, encryptTotpSecret(secret), updatedAt, updatedAt);
    const uri = createTotpUri(session.user.email || session.user.username, secret);
    return res.json({
      secret,
      otpauthUrl: uri,
      qrCode: await createTotpQrCode(uri)
    });
  }

  async function confirmMfa(req, res) {
    const session = await requireMfaState(req, res, 'mfa_setup');
    if (!session) return;
    const parsed = mfaConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: 'invalid_mfa_code',
        message: 'Authenticator code must contain exactly 6 digits.'
      });
    }
    const security = db.prepare(`
      SELECT totp_secret_enc, totp_enabled, totp_last_step
      FROM supabase_admin_security
      WHERE user_id = ?
    `).get(session.userId);
    if (!security || security.totp_enabled || !security.totp_secret_enc) {
      return res.status(409).json({ error: 'mfa_setup_unavailable' });
    }

    try {
      const secret = decryptTotpSecret(security.totp_secret_enc);
      const step = findTotpStep(secret, parsed.data.code, now().getTime(), security.totp_last_step);
      if (step === null) return res.status(422).json({ error: 'invalid_mfa_code' });

      const recoveryCodes = createRecoveryCodes();
      const createdAt = now().toISOString();
      const rotation = prepareVerifiedSession(session);
      db.transaction(() => {
        db.prepare(`
          UPDATE supabase_admin_security
          SET totp_enabled = 1, totp_last_step = ?, updated_at = ?
          WHERE user_id = ?
        `).run(step, createdAt, session.userId);
        db.prepare('DELETE FROM supabase_admin_recovery_codes WHERE user_id = ?')
          .run(session.userId);
        const insert = db.prepare(`
          INSERT INTO supabase_admin_recovery_codes (id, user_id, code_hash, created_at)
          VALUES (?, ?, ?, ?)
        `);
        recoveryCodes.forEach((code) =>
          insert.run(crypto.randomUUID(), session.userId, hashRecoveryCode(code), createdAt)
        );
        persistVerifiedSession(session, rotation);
      })();
      setSessionCookie(res, rotation.rawSessionToken);
      return res.json({ mfaEnabled: true, recoveryCodes, expiresAt: rotation.expiresAt });
    } catch (error) {
      logger.error('Failed to enable Supabase admin MFA:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  }

  async function verifyMfa(req, res) {
    const session = await requireMfaState(req, res, 'mfa_pending');
    if (!session) return;
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: 'invalid_mfa_code',
        message: 'Enter a 6-digit authenticator code or a recovery code in XXXXX-XXXXX format.'
      });
    }
    const security = db.prepare(`
      SELECT totp_secret_enc, totp_enabled, totp_last_step
      FROM supabase_admin_security
      WHERE user_id = ?
    `).get(session.userId);
    if (!security?.totp_enabled || !security.totp_secret_enc) {
      return res.status(401).json({ error: 'invalid_mfa_code' });
    }

    try {
      const secret = decryptTotpSecret(security.totp_secret_enc);
      const step = findTotpStep(secret, parsed.data.code, now().getTime(), security.totp_last_step);
      let valid = step !== null;
      if (step === null) {
        const codeHash = hashRecoveryCode(parsed.data.code);
        const recoveryCode = db.prepare(`
          SELECT id FROM supabase_admin_recovery_codes
          WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
        `).get(session.userId, codeHash);
        if (recoveryCode) {
          valid = db.prepare(`
            UPDATE supabase_admin_recovery_codes
            SET used_at = ?
            WHERE id = ? AND used_at IS NULL
          `).run(now().toISOString(), recoveryCode.id).changes === 1;
        }
      }
      if (!valid) return res.status(401).json({ error: 'invalid_mfa_code' });

      const verifiedAt = now().toISOString();
      const rotation = prepareVerifiedSession(session);
      db.transaction(() => {
        if (step !== null) {
          db.prepare(`
            UPDATE supabase_admin_security
            SET totp_last_step = ?, updated_at = ?
            WHERE user_id = ?
          `).run(step, verifiedAt, session.userId);
        }
        persistVerifiedSession(session, rotation);
      })();
      setSessionCookie(res, rotation.rawSessionToken);
      return res.json({
        authenticated: true,
        expiresAt: rotation.expiresAt,
        user: { ...session.user, mfaEnabled: true }
      });
    } catch (error) {
      logger.error('Failed to verify Supabase admin MFA:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  }

  async function listAdminUsers({ page, limit }) {
    const profileResult = await adminClient.from('admin_profiles')
      .select('id,display_name,role_key,is_active,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (profileResult.error) {
      const error = new Error(`Supabase admin directory lookup failed: ${profileResult.error.message}`);
      error.cause = profileResult.error;
      throw error;
    }
    if (!Array.isArray(profileResult.data) || !Number.isInteger(profileResult.count)) {
      throw new Error('Supabase admin directory returned an invalid result.');
    }

    const rolesResult = await adminClient.from('roles').select('role_key,name');
    if (rolesResult.error) {
      const error = new Error(`Supabase admin roles lookup failed: ${rolesResult.error.message}`);
      error.cause = rolesResult.error;
      throw error;
    }
    if (!Array.isArray(rolesResult.data)) {
      throw new Error('Supabase admin roles lookup returned an invalid result.');
    }
    const roleNames = new Map(rolesResult.data.map((role) => [role.role_key, role.name]));
    const users = await Promise.all(profileResult.data.map(async (profile) => {
      const result = await adminClient.auth.admin.getUserById(profile.id);
      if (result.error) {
        const error = new Error(`Supabase admin identity lookup failed: ${result.error.message}`);
        error.cause = result.error;
        throw error;
      }
      const authUser = result.data?.user;
      const role = ROLE_KEYS[profile.role_key];
      const roleName = roleNames.get(profile.role_key);
      if (!authUser || typeof authUser.email !== 'string' || !role || !roleName) {
        throw new Error('Supabase admin directory contains an incomplete profile.');
      }
      return {
        id: profile.id,
        email: authUser.email,
        displayName: profile.display_name,
        roleKey: profile.role_key,
        role,
        roleName,
        active: Boolean(profile.is_active),
        createdAt: profile.created_at
      };
    }));
    return { users, total: profileResult.count };
  }

  async function listAdminRoles() {
    const result = await adminClient.from('roles')
      .select('role_key,name,description,is_system')
      .order('name', { ascending: true });
    if (result.error) {
      const error = new Error(`Supabase admin role list failed: ${result.error.message}`);
      error.cause = result.error;
      throw error;
    }
    if (!Array.isArray(result.data)) throw new Error('Supabase admin role list returned an invalid result.');
    return result.data
      .filter((role) => ROLE_KEYS[role.role_key])
      .map((role) => ({
        roleKey: role.role_key,
        name: role.name,
        description: role.description,
        system: Boolean(role.is_system)
      }));
  }

  async function removeInvitedUser(userId) {
    try {
      const result = await adminClient.auth.admin.deleteUser(userId);
      if (result.error) {
        logger.error('Failed to remove an invited Supabase user after profile creation failed:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Failed to remove an invited Supabase user after profile creation failed:', error);
      return false;
    }
  }

  async function inviteAdminUser(req, res) {
    const parsed = inviteAdminUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        error: { code: 'invalid_profile', message: 'Provide a valid email, display name, and role.' },
        meta: null
      });
    }

    try {
      const roleResult = await adminClient.from('roles')
        .select('role_key')
        .eq('role_key', parsed.data.roleKey)
        .maybeSingle();
      if (roleResult.error) throw roleResult.error;
      if (!roleResult.data) {
        return res.status(400).json({
          data: null,
          error: { code: 'invalid_profile', message: 'The selected administrator role is unavailable.' },
          meta: null
        });
      }

      const inviteResult = await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
        data: { display_name: parsed.data.displayName }
      });
      if (inviteResult.error) {
        logger.error('Supabase administrator invitation failed:', inviteResult.error);
        const details = getUserManagementError(inviteResult.error);
        return res.status(details.status).json({ data: null, error: details, meta: null });
      }

      const invitedUser = inviteResult.data?.user;
      if (!invitedUser?.id) throw new Error('Supabase invitation returned no user identity.');
      const profileResult = await adminClient.rpc('create_admin_profile_with_audit', {
        p_actor_user_id: req.adminUser.id,
        p_user_id: invitedUser.id,
        p_display_name: parsed.data.displayName,
        p_role_key: parsed.data.roleKey,
        p_request_id: req.id || null
      });
      const profile = Array.isArray(profileResult.data)
        ? profileResult.data[0]
        : profileResult.data;
      if (profileResult.error || !profile || profile.id !== invitedUser.id) {
        const cleanupSucceeded = await removeInvitedUser(invitedUser.id);
        if (profileResult.error) logger.error('Supabase administrator profile creation failed:', profileResult.error);
        else logger.error('Supabase administrator profile creation returned an invalid result.');
        if (!cleanupSucceeded) {
          return res.status(503).json({
            data: null,
            error: {
              code: 'invited_user_cleanup_failed',
              message: 'The profile could not be created; remove the pending identity in Supabase before retrying.'
            },
            meta: null
          });
        }
        const details = getUserManagementError(profileResult.error);
        return res.status(details.status).json({ data: null, error: details, meta: null });
      }

      return res.status(201).json({
        data: {
          id: profile.id,
          email: parsed.data.email,
          displayName: profile.display_name,
          roleKey: profile.role_key,
          role: ROLE_KEYS[profile.role_key],
          active: Boolean(profile.is_active),
          createdAt: profile.created_at
        },
        error: null,
        meta: null
      });
    } catch (error) {
      logger.error('Supabase administrator invitation could not be completed:', error);
      const details = getUserManagementError(error);
      return res.status(details.status).json({ data: null, error: details, meta: null });
    }
  }

  async function updateAdminUser(req, res) {
    const parsedParams = updateAdminUserParamsSchema.safeParse(req.params);
    const parsedBody = updateAdminUserBodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return res.status(400).json({
        data: null,
        error: { code: 'invalid_profile', message: 'Provide a valid administrator ID and at least one valid field.' },
        meta: null
      });
    }

    try {
      const result = await adminClient.rpc('update_admin_profile_with_audit', {
        p_actor_user_id: req.adminUser.id,
        p_user_id: parsedParams.data.id,
        p_display_name: parsedBody.data.displayName ?? null,
        p_role_key: parsedBody.data.roleKey ?? null,
        p_is_active: parsedBody.data.active ?? null,
        p_request_id: req.id || null
      });
      if (result.error) {
        logger.error('Supabase administrator profile update failed:', result.error);
        const details = getUserManagementError(result.error);
        return res.status(details.status).json({ data: null, error: details, meta: null });
      }
      const profile = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!profile || profile.id !== parsedParams.data.id) {
        throw new Error('Supabase administrator profile update returned an invalid result.');
      }
      return res.json({
        data: {
          id: profile.id,
          displayName: profile.display_name,
          roleKey: profile.role_key,
          role: ROLE_KEYS[profile.role_key],
          active: Boolean(profile.is_active),
          updatedAt: profile.updated_at
        },
        error: null,
        meta: null
      });
    } catch (error) {
      logger.error('Supabase administrator profile update could not be completed:', error);
      const details = getUserManagementError(error);
      return res.status(details.status).json({ data: null, error: details, meta: null });
    }
  }

  const router = express.Router();
  router.get('/config', limiters.admin, (req, res) =>
    res.json({ provider: 'supabase', loginField: 'email' }));
  router.post('/step-up', limiters.stepUp, requireAllowedOrigin, requireAdmin,
    async (req, res) => {
      try {
        return await verifyStepUp(req, res, { db, createAuthClient, now, logger });
      } catch (error) {
        logger.error('Failed to verify administrator step-up authentication:', error);
        return res.status(503).json({
          error: 'step_up_unavailable',
          message: 'Additional verification is temporarily unavailable.'
        });
      }
    });
  router.post('/login', limiters.login, requireAllowedOrigin, async (req, res) => {
    try {
      return await login(req, res);
    } catch (error) {
      logger.error('Supabase admin login failed:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });
  router.get('/session', limiters.admin, async (req, res) => {
    try {
      const session = await getSession(req);
      return res.json({
        authenticated: Boolean(session && session.authState === 'verified' && session.user.mfaEnabled),
        mfaState: session ? session.authState : null,
        expiresAt: session ? session.expiresAt : null,
        user: session ? session.user : null
      });
    } catch (error) {
      logger.error('Failed to check Supabase admin session:', error);
      return res.status(503).json({ error: 'auth_service_unavailable' });
    }
  });
  router.post('/logout', limiters.admin, requireAllowedOrigin, async (req, res) => {
    try {
      const session = await getSession(req);
      let signOutError = null;
      if (session) {
        db.prepare('DELETE FROM supabase_admin_sessions WHERE session_hash = ?')
          .run(session.sessionHash);
        db.prepare('DELETE FROM admin_step_up_sessions WHERE session_hash = ?')
          .run(session.sessionHash);
        const result = await session.authClient.auth.signOut({ scope: 'local' });
        signOutError = result.error;
      }
      clearSessionCookie(res);
      if (signOutError) {
        logger.error('Supabase admin sign-out failed:', signOutError);
        return res.status(503).json({ error: 'auth_service_unavailable' });
      }
      return res.status(204).end();
    } catch (error) {
      logger.error('Failed to sign out Supabase admin:', error);
      return res.status(503).json({ error: 'auth_service_unavailable' });
    }
  });
  router.post('/mfa/setup', limiters.enrollment, requireAllowedOrigin, async (req, res) => {
    try {
      return await setupMfa(req, res);
    } catch (error) {
      logger.error('Failed to initialize Supabase admin MFA:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });
  router.post('/mfa/confirm', limiters.enrollment, requireAllowedOrigin, async (req, res) => {
    try {
      return await confirmMfa(req, res);
    } catch (error) {
      logger.error('Failed to confirm Supabase admin MFA:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });
  router.post('/mfa/verify', limiters.challenge, requireAllowedOrigin, async (req, res) => {
    try {
      return await verifyMfa(req, res);
    } catch (error) {
      logger.error('Failed to verify Supabase admin MFA:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  router.get('/users', limiters.admin, requireAdmin, requireRoles('owner'), async (req, res) => {
    const parsedQuery = userListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        data: null,
        error: { code: 'invalid_query', message: 'Page and limit must be valid positive integers.' },
        meta: null
      });
    }
    try {
      const result = await listAdminUsers(parsedQuery.data);
      return res.json({
        data: result.users,
        error: null,
        meta: { page: parsedQuery.data.page, limit: parsedQuery.data.limit, total: result.total }
      });
    } catch (error) {
      logger.error('Failed to list Supabase admin users:', error);
      return res.status(503).json({
        data: null,
        error: { code: 'user_directory_unavailable', message: 'Unable to load administrator accounts.' },
        meta: null
      });
    }
  });
  router.get('/roles', limiters.admin, requireAdmin, requireRoles('owner'), async (req, res) => {
    try {
      return res.json({ data: await listAdminRoles(), error: null, meta: null });
    } catch (error) {
      logger.error('Failed to list Supabase admin roles:', error);
      return res.status(503).json({
        data: null,
        error: { code: 'role_list_unavailable', message: 'Unable to load administrator roles.' },
        meta: null
      });
    }
  });
  router.post('/users', limiters.users, requireAllowedOrigin, requireAdmin,
    requireRoles('owner'), requireAdminStepUp, inviteAdminUser);
  router.patch('/users/:id', limiters.users, requireAllowedOrigin, requireAdmin,
    requireRoles('owner'), requireAdminStepUp, updateAdminUser);

  return Object.freeze({
    getSession,
    loadProfile,
    checkConnection,
    router
  });
}

module.exports = { createSupabaseAdminAuth };

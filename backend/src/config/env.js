'use strict';

const path = require('node:path');

const DEFAULT_PORT = 3001;
const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);

function parseFrontendOrigins(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];

  return value.split(',').map((entry) => {
    const origin = entry.trim();
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('FRONTEND_ORIGINS must contain valid HTTP(S) origins.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.username ||
        parsed.password) {
      throw new Error('FRONTEND_ORIGINS must contain origins only, without paths or trailing slashes.');
    }
    return origin;
  }).filter(Boolean);
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!ALLOWED_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const rawPort = env.PORT || String(DEFAULT_PORT);
  if (!/^\d+$/.test(rawPort)) throw new Error('PORT must be an integer from 1 to 65535.');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const frontendOrigins = parseFrontendOrigins(env.FRONTEND_ORIGINS);
  if (!frontendOrigins.length) throw new Error('Set FRONTEND_ORIGINS to at least one exact site origin.');
  if (nodeEnv === 'production' && frontendOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('Production FRONTEND_ORIGINS must use HTTPS.');
  }

  const authEncryptionKey = env.RAFA_AUTH_ENCRYPTION_KEY || '';
  const decodedAuthKey = Buffer.from(authEncryptionKey, 'base64');
  if (decodedAuthKey.length !== 32 || decodedAuthKey.toString('base64') !== authEncryptionKey) {
    throw new Error('Set RAFA_AUTH_ENCRYPTION_KEY to a base64-encoded random 32-byte key.');
  }

  const databasePath = env.DATABASE_PATH || './data/RAFA-events.db';
  if (typeof databasePath !== 'string' || databasePath.trim() === '') {
    throw new Error('DATABASE_PATH must be a non-empty path.');
  }
  const adminAuthDatabasePath = env.ADMIN_AUTH_DATABASE_PATH || './data/RAFA-admin-auth.db';
  if (typeof adminAuthDatabasePath !== 'string' || adminAuthDatabasePath.trim() === '') {
    throw new Error('ADMIN_AUTH_DATABASE_PATH must be a non-empty path.');
  }
  const resolvedDatabasePath = path.resolve(__dirname, '..', '..', databasePath);
  const resolvedAdminAuthDatabasePath = path.resolve(__dirname, '..', '..', adminAuthDatabasePath);
  const sameDatabasePath = process.platform === 'win32'
    ? resolvedDatabasePath.toLowerCase() === resolvedAdminAuthDatabasePath.toLowerCase()
    : resolvedDatabasePath === resolvedAdminAuthDatabasePath;
  if (sameDatabasePath) {
    throw new Error('ADMIN_AUTH_DATABASE_PATH must be separate from DATABASE_PATH.');
  }

  const websiteDataProvider = env.WEBSITE_DATA_PROVIDER || 'supabase';
  if (!['sqlite', 'supabase'].includes(websiteDataProvider)) {
    throw new Error('WEBSITE_DATA_PROVIDER must be either sqlite or supabase.');
  }
  const adminAuthProvider = env.ADMIN_AUTH_PROVIDER || 'supabase';
  if (!['sqlite', 'supabase'].includes(adminAuthProvider)) {
    throw new Error('ADMIN_AUTH_PROVIDER must be either sqlite or supabase.');
  }

  return Object.freeze({
    nodeEnv,
    port,
    frontendOrigins,
    authEncryptionKey,
    databasePath,
    adminAuthDatabasePath,
    websiteDataProvider,
    adminAuthProvider
  });
}

module.exports = { loadConfig, parseFrontendOrigins };

'use strict';

const PROJECT_REFS = Object.freeze({
  development: 'jpitvhgyjsalswjuuwpm',
  production: 'orybroticrcobzkxfpzv'
});

function loadSupabaseConfig(env = process.env) {
  if (env.RAFA_ENV && !Object.hasOwn(PROJECT_REFS, env.RAFA_ENV)) {
    throw new Error('RAFA_ENV must be development or production.');
  }

  const url = env.SUPABASE_URL || '';
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be a valid Supabase HTTP(S) URL.');
  }

  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if ((!['https:', 'http:'].includes(parsedUrl.protocol)) ||
      (parsedUrl.protocol !== 'https:' && !isLoopback) ||
      parsedUrl.username || parsedUrl.password || parsedUrl.pathname !== '/' ||
      parsedUrl.search || parsedUrl.hash) {
    throw new Error('SUPABASE_URL must be an HTTPS project origin (HTTP is allowed only for local development).');
  }

  const expectedProjectRef = PROJECT_REFS[env.RAFA_ENV];
  if ((env.RAFA_ENV === 'production' &&
       parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`) ||
      (env.RAFA_ENV === 'development' && !isLoopback &&
       parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`)) {
    throw new Error('SUPABASE_URL does not match the selected RAFA_ENV project.');
  }

  const anonKey = env.SUPABASE_ANON_KEY || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!anonKey.trim()) throw new Error('Set SUPABASE_ANON_KEY for Supabase Auth.');
  if (!serviceRoleKey.trim()) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY for server-side database access.');

  return Object.freeze({ url: parsedUrl.origin, anonKey, serviceRoleKey });
}

module.exports = { loadSupabaseConfig, PROJECT_REFS };

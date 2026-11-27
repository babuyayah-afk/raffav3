'use strict';

const { createClient } = require('@supabase/supabase-js');
const { loadSupabaseConfig } = require('./config/supabase');

let adminClient;

function getSupabaseAdminClient(env = process.env) {
  if (env === process.env && adminClient) return adminClient;

  const config = loadSupabaseConfig(env);
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });

  if (env === process.env) adminClient = client;
  return client;
}

function createSupabaseAuthClient(env = process.env) {
  const config = loadSupabaseConfig(env);
  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

module.exports = { createSupabaseAuthClient, getSupabaseAdminClient };

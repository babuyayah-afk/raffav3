'use strict';

const APPLICATION_ENVIRONMENTS = new Set(['development', 'production']);

function resolveRuntimeEnvironment(env = process.env) {
  const rafaEnvironment = env.RAFA_ENV || env.NODE_ENV || 'development';
  if (!APPLICATION_ENVIRONMENTS.has(rafaEnvironment)) {
    throw new Error('RAFA_ENV must be development or production.');
  }

  const nodeEnvironment = env.NODE_ENV || rafaEnvironment;
  if (!APPLICATION_ENVIRONMENTS.has(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development or production.');
  }
  if (rafaEnvironment === 'production' && nodeEnvironment !== 'production') {
    throw new Error('NODE_ENV must be production when RAFA_ENV is production.');
  }

  return Object.freeze({ rafaEnvironment, nodeEnvironment });
}

module.exports = { resolveRuntimeEnvironment };

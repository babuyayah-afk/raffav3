// config/limits.js — every tunable limit in one place.
const MIN = 60 * 1000;
export const LIMITS = Object.freeze({
  health:      { windowMs: MIN,       limit: 60 },
  publicRead:  { windowMs: MIN,       limit: 120 },
  contact:     { windowMs: 15 * MIN,  limit: 5 },
  celebration: { windowMs: 15 * MIN,  limit: 5 },
  orderReq:    { windowMs: 15 * MIN,  limit: 5 },
  newsletter:  { windowMs: 60 * MIN,  limit: 5 },
  admin:       { windowMs: MIN,       limit: 100 },
  adminAuthFail: { windowMs: 15 * MIN, limit: 10 },
});
export const SIZES = Object.freeze({ jsonDefault: '100kb', jsonPublicForm: '10kb' });
export const TIMEOUTS = Object.freeze({ publicMs: 10_000, adminMs: 30_000 });
export const SHED = Object.freeze({ lagMs: 200, maxInFlight: 200 });
export const BAN_STEPS_MS = [15 * MIN, 60 * MIN, 24 * 60 * MIN];

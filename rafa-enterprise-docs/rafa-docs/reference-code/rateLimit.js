// middleware/rateLimit.js — tiered limiters + escalating auto-ban (single node, in-memory).
// Multi-instance: swap stores for rate-limit-redis and keep bans in Redis.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { LIMITS, BAN_STEPS_MS } from '../config/limits.js';

const strikes = new Map(); // ip -> { count, lastAt }
const bans = new Map();    // ip -> until (ms epoch)

setInterval(() => {
  const now = Date.now();
  for (const [ip, until] of bans) if (until < now) bans.delete(ip);
  for (const [ip, s] of strikes) if (now - s.lastAt > 24 * 60 * 60 * 1000) strikes.delete(ip);
}, 60_000).unref();

export function recordOffence(ip, severity = 1) {
  const now = Date.now();
  const s = strikes.get(ip) ?? { count: 0, lastAt: now };
  s.count += severity;
  s.lastAt = now;
  strikes.set(ip, s);
  if (s.count >= 3) {
    const step = Math.min(Math.floor(s.count / 3) - 1, BAN_STEPS_MS.length - 1);
    bans.set(ip, now + BAN_STEPS_MS[step]);
  }
}

export function banGuard(req, res, next) {
  const until = bans.get(req.ip);
  if (until && until > Date.now()) {
    const retryAfter = Math.ceil((until - Date.now()) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', requestId: req.id, retryAfter } });
  }
  next();
}

function make(cfg, { failClosed = false } = {}) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    passOnStoreError: !failClosed,
    handler(req, res, _next, options) {
      recordOffence(req.ip);
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', requestId: req.id, retryAfter } });
    },
  });
}

export const limiters = {
  health: make(LIMITS.health),
  publicRead: make(LIMITS.publicRead),
  contact: make(LIMITS.contact, { failClosed: true }),
  celebration: make(LIMITS.celebration, { failClosed: true }),
  orderReq: make(LIMITS.orderReq, { failClosed: true }),
  newsletter: make(LIMITS.newsletter, { failClosed: true }),
  admin: make(LIMITS.admin, { failClosed: true }),
  adminAuthFail: rateLimit({
    windowMs: LIMITS.adminAuthFail.windowMs,
    limit: LIMITS.adminAuthFail.limit,
    skipSuccessfulRequests: true, // only failures count
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler(req, res) {
      recordOffence(req.ip, 3);
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.', requestId: req.id } });
    },
  }),
};

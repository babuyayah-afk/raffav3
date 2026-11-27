// middleware/security.js
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

export function applySecurity(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('etag', 'strong');

  app.use(requestId);
  app.use(
    helmet({
      // API returns JSON only; lock everything down.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    })
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients (no Origin) are allowed; browsers must match exactly.
        if (!origin || env.allowedOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      maxAge: 600,
    })
  );

  app.use(hpp());
  app.use(compression({ threshold: 1024 }));
}

// Reject non-JSON bodies on write methods early (415).
export function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] !== '0') {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json', requestId: req.id } });
    }
  }
  next();
}

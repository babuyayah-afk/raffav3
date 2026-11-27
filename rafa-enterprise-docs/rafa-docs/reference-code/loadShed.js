// middleware/loadShed.js — protect the process when overloaded.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { SHED } from '../config/limits.js';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
let inFlight = 0;
let shedCount = 0;

setInterval(() => h.reset(), 10_000).unref();

export const lagMs = () => h.mean / 1e6;
export const stats = () => ({ lagMs: lagMs(), inFlight, shedCount });

// Always allow health + cached public reads; shed writes first, then everything non-critical.
export function loadShed(req, res, next) {
  const critical = req.path.startsWith('/health');
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  const overloaded = lagMs() > SHED.lagMs || inFlight >= SHED.maxInFlight;

  if (overloaded && !critical && !(isRead && req.path.startsWith('/api/v1/site-content'))) {
    shedCount++;
    res.set('Retry-After', '5');
    return res.status(503).json({ error: { code: 'OVERLOADED', message: 'The service is busy. Please retry shortly.', requestId: req.id, retryAfter: 5 } });
  }

  inFlight++;
  let done = false;
  const finish = () => { if (!done) { done = true; inFlight--; } };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}

export function requestTimeout(ms) {
  return (req, res, next) => {
    const t = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Request timed out.', requestId: req.id } });
      }
    }, ms);
    res.on('finish', () => clearTimeout(t));
    res.on('close', () => clearTimeout(t));
    next();
  };
}

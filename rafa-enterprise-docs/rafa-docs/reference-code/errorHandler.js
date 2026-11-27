// middleware/errorHandler.js — single place that shapes errors.
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(code, status, message, { fields, retryAfter, cause, expose = true } = {}) {
    super(message, { cause });
    this.code = code; this.status = status; this.fields = fields; this.retryAfter = retryAfter; this.expose = expose;
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
}

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (res.headersSent) return res.destroy();

    let status = 500, code = 'INTERNAL', message = 'Something went wrong. Please try again.', fields, retryAfter;

    if (err instanceof ZodError) {
      status = 400; code = 'VALIDATION_FAILED'; message = 'Please check the highlighted fields.';
      fields = err.flatten().fieldErrors;
    } else if (err instanceof AppError) {
      ({ status, code, fields, retryAfter } = err);
      if (err.expose) message = err.message;
    } else if (err.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request too large.';
    } else if (err.type === 'entity.parse.failed') {
      status = 400; code = 'VALIDATION_FAILED'; message = 'Malformed JSON.';
    } else if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
      status = 503; code = 'DEPENDENCY_UNAVAILABLE'; message = 'Busy, please retry shortly.'; retryAfter = 2;
    }

    const level = status >= 500 ? 'error' : 'warn';
    logger[level]({ err, reqId: req.id, route: req.route?.path ?? req.path, status, code }, 'request failed');

    if (retryAfter) res.set('Retry-After', String(retryAfter));
    res.status(status).json({ error: { code, message, requestId: req.id, ...(fields && { fields }), ...(retryAfter && { retryAfter }) } });
  };
}

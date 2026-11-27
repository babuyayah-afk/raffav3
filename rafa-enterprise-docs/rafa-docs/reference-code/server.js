// server.js — listen, graceful shutdown, last-resort process handlers.
import http from 'node:http';
import pino from 'pino';
import { env } from './config/env.js';
// import { createApp } from './app.js';   // build app = express() + middleware + routes (no listen)
// import { openDb, closeDb } from './db.js';
// import { startOutboxWorker } from './jobs/outbox.js';

const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.phone', '*.token', '*.password'],
  base: { service: 'rafa-api', env: env.NODE_ENV, release: env.RELEASE_SHA },
});

// const db = openDb(env.DB_PATH, new URL('../database/migrations/', import.meta.url).pathname);
// const app = createApp({ db, logger });
// const worker = startOutboxWorker({ db, handlers: {}, logger });
const app = (req, res) => { res.end('replace with createApp()'); };

const server = http.createServer(app);
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.maxHeadersCount = 50;

let shuttingDown = false;
export const isShuttingDown = () => shuttingDown; // readiness endpoint returns 503 when true

async function shutdown(reason, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn({ reason }, 'shutting down');
  const force = setTimeout(() => { logger.error('forced exit'); process.exit(code || 1); }, 15_000);
  force.unref();
  server.close(async () => {
    try {
      // await worker.stop();
      // closeDb(db);
      logger.info('clean shutdown');
    } finally { process.exit(code); }
  });
  server.closeIdleConnections?.();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Unknown state: log everything, exit non-zero, let the supervisor start a clean process.
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaughtException'); shutdown('uncaughtException', 1); });
process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'unhandledRejection'); shutdown('unhandledRejection', 1); });

server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));

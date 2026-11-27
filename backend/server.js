// RAFA Events — backend, Phase 1 slice
//
// Express API for public inquiry/order submissions and authenticated
// persistent website-content and request management.
//
// Setup:
//   cd backend
//   npm install
//   copy .env.development.example .env.development and set development credentials,
//   FRONTEND_ORIGINS, and RAFA_AUTH_ENCRYPTION_KEY
//   npm start
const path = require('node:path');
const environment = process.env.RAFA_ENV || process.env.NODE_ENV || 'development';
if (!['development', 'production'].includes(environment)) {
	throw new Error('RAFA_ENV must be development or production.');
}
if (process.env.NODE_ENV && process.env.NODE_ENV !== environment) {
	throw new Error('RAFA_ENV and NODE_ENV must match.');
}
process.env.RAFA_ENV = environment;
process.env.NODE_ENV = environment;

const dotenvResult = require('dotenv').config({
	path: path.join(__dirname, `.env.${environment}`)
});
if (dotenvResult.error && dotenvResult.error.code !== 'ENOENT') throw dotenvResult.error;

const { loadConfig } = require('./src/config/env');
const config = loadConfig();
process.env.NODE_ENV = config.nodeEnv;
process.env.DATABASE_PATH = config.databasePath;
process.env.ADMIN_AUTH_DATABASE_PATH = config.adminAuthDatabasePath;
process.env.WEBSITE_DATA_PROVIDER = config.websiteDataProvider;
process.env.ADMIN_AUTH_PROVIDER = config.adminAuthProvider;

const app = require('./src/app');
const db = require('./src/db');
app.locals.inquiryWorker?.start();

const server = app.listen(config.port, () => {
	console.info(`RAFA Events backend listening on port ${config.port}`);
});

let shuttingDown = false;
let shutdownTimeout;

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	app.locals.inquiryWorker?.stop();
	console.info(`Received ${signal}; shutting down gracefully.`);

	shutdownTimeout = setTimeout(() => {
		console.error('Graceful shutdown timed out; closing active connections.');
		if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
		process.exitCode = 1;
	}, 10000);
	shutdownTimeout.unref();

	server.close((error) => {
		clearTimeout(shutdownTimeout);
		if (error) {
			console.error('HTTP server shutdown failed:', error);
			process.exitCode = 1;
		}
		try {
			app.locals.adminAuthDatabase?.pragma('optimize');
			app.locals.adminAuthDatabase?.close();
			db.pragma('optimize');
			db.close();
		} catch (databaseError) {
			console.error('Database shutdown failed:', databaseError);
			process.exitCode = 1;
		}
	});
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

'use strict';

const cors = require('cors');
const helmet = require('helmet');

function configureSecurity(app, allowedOrigins) {
  const originSet = new Set(allowedOrigins);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || originSet.has(origin));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    credentials: true,
    maxAge: 600
  }));
}

module.exports = { configureSecurity };

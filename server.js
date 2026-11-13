const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./src/config');
const { connectDB } = require('./src/db');
const { initScheduler } = require('./src/jobs/scheduler');
const auditRoutes = require('./src/routes/audits');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        connectSrc: ["'self'"],
        frameSrc: ['https://challenges.cloudflare.com']
      }
    }
  })
);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // In development, also permit localhost and 127.0.0.1 on any port
    if (config.NODE_ENV === 'development') {
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch (_) {}
    }
    const error = new Error('Not allowed by CORS');
    error.status = 403;
    error.code = 'CORS_ERROR';
    return callback(error);
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', auditRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Central error handler - never leaks stack traces
app.use((err, req, res, next) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = status < 500 && err.message
    ? err.message
    : 'Something went wrong. Please try again.';
  const code = err.code || (status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR');

  res.status(status).json({
    error: message,
    code: typeof code === 'string' ? code : 'INTERNAL_ERROR'
  });
});

async function startServer() {
  try {
    await connectDB();
    initScheduler();
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${config.PORT} (http://localhost:${config.PORT} or http://127.0.0.1:${config.PORT})`);
    });
    return server;
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;

// ============================================================
// config/logger.js — Structured Application Logger
//
// Uses 'pino' for fast, structured JSON logging in production
// and a human-readable pretty format in development.
//
// Why pino over console.log?
//   - JSON output integrates with Datadog, CloudWatch, ELK, Loki
//   - Async writes (non-blocking) — console.log is synchronous
//   - Built-in log levels (fatal, error, warn, info, debug, trace)
//   - Zero performance cost in production at correct log level
//
// Usage anywhere in the codebase:
//   const logger = require('../config/logger');
//   logger.info({ userId }, 'User logged in');
//   logger.error({ err }, 'Something went wrong');
// ============================================================

const pino  = require("pino");
const { env } = require("./env");

const isDev  = env.NODE_ENV === "development";
const isTest = env.NODE_ENV === "test";

const logger = pino({
  // In development: human-readable output with colours (uses pino-pretty worker thread)
  // In test:        plain JSON (pino-pretty incompatible with Jest worker threads)
  // In production:  plain JSON (compact, one line per entry for log aggregators)
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,

  // Silence all logs in test environment to keep test output clean
  level: isTest ? "silent" : (process.env.LOG_LEVEL || (isDev ? "debug" : "info")),

  // Redact sensitive fields so they never appear in logs
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.token",
      "*.jwt",
    ],
    censor: "[REDACTED]",
  },

  // Base context included in every log line
  base: { service: "campus-gig-backend", env: env.NODE_ENV },
});

module.exports = logger;

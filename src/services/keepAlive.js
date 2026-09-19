// ============================================================
// services/keepAlive.js — Prevent Render Free-Tier Sleep
//
// Render's free tier spins down instances after 15 minutes of
// inactivity. This service pings the server's own health endpoint
// every 10 minutes so it stays warm.
//
// Only runs in production — no-op in development.
// ============================================================

const cron   = require("node-cron");
const http   = require("http");
const https  = require("https");
const { env }    = require("../config/env");
const logger = require("../config/logger");

function startKeepAlive() {
  // Only run in production (Render). Skip in local dev.
  if (env.NODE_ENV !== "production") {
    logger.info("[KeepAlive] Skipped — not in production");
    return;
  }

  // Determine the URL to ping.
  // RENDER_EXTERNAL_URL is automatically set by Render on all instances.
  // Fall back to CLIENT_URL's host if not available.
  const pingUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/`
    : "https://campus-gig-backend.onrender.com/";

  // Ping every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    const lib = pingUrl.startsWith("https") ? https : http;
    const req = lib.get(pingUrl, (res) => {
      logger.info(
        { status: res.statusCode, url: pingUrl },
        "[KeepAlive] Ping successful"
      );
    });
    req.on("error", (err) => {
      logger.warn({ err: err.message }, "[KeepAlive] Ping failed");
    });
    req.end();
  });

  logger.info({ pingUrl, interval: "10min" }, "[KeepAlive] Scheduler started");
}

module.exports = { startKeepAlive };

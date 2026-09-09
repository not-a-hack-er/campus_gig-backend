// ============================================================
// app.js — Express application setup
//
// This file configures the Express app:
//   - Security headers (helmet)
//   - Reverse proxy trust (for correct IP + HTTPS behind Nginx/ALB)
//   - Structured HTTP request logging (pino-http)
//   - CORS (restricted to known origins in production)
//   - JSON/body parsing
//   - Static file serving
//   - Rate limiting (global + strict auth limiter)
//   - All API routes
//   - 404 and global error handlers
//
// It does NOT start the server — that is done in server.js
// ============================================================

const path    = require("path");
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const pinoHttp = require("pino-http");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");

const { env }               = require("./config/env");
const logger                = require("./config/logger");
const { globalLimiter, authLimiter } = require("./middleware/rateLimiter");
const errorHandler          = require("./middleware/errorHandler");

// Import all route files
const authRoutes         = require("./routes/authRoutes");
const gigRoutes          = require("./routes/gigRoutes");
const applicationRoutes  = require("./routes/applicationRoutes");
const chatRoutes         = require("./routes/chatRoutes");
const communityRoutes    = require("./routes/communityRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reviewRoutes       = require("./routes/reviewRoutes");
const userRoutes         = require("./routes/userRoutes");
const messageRoutes      = require("./routes/messageRoutes");
const feedbackRoutes     = require("./routes/feedbackRoutes");
const legalPages         = require("./routes/legalPages");

const app = express();

// ─── Reverse Proxy Trust ─────────────────────────────────────────────────────
// CRITICAL for production: tells Express to trust X-Forwarded-For and
// X-Forwarded-Proto headers set by Nginx, AWS ALB, or Cloudflare.
//
// Without this:
//   - req.ip returns the proxy's IP, so the rate limiter throttles ALL users
//     together (one proxy IP = one limit for every user behind it)
//   - req.protocol returns "http" even when the client is on HTTPS,
//     which generates wrong avatar URLs
//
// "1" means trust exactly one level of proxy (the load balancer in front of us)
app.set("trust proxy", 1);

// ─── Security Headers (helmet) ────────────────────────────────────────────────
// helmet sets ~14 HTTP security headers automatically:
//   - X-Frame-Options: SAMEORIGIN             (Clickjacking protection)
//   - X-Content-Type-Options: nosniff         (MIME sniffing protection)
//   - Referrer-Policy: no-referrer            (Privacy)
//   - X-DNS-Prefetch-Control: off             (DNS privacy)
//   - Strict-Transport-Security (HSTS)        (Force HTTPS)
//   - Content-Security-Policy                 (XSS mitigation for browser clients)
//   - Cross-Origin-Opener-Policy              (Isolation)
app.use(helmet());

// ─── Response Compression ─────────────────────────────────────────────────────
// Gzip/Brotli compresses JSON response bodies by 70-80%, drastically reducing
// bandwidth usage and latency under heavy traffic.
app.use(compression());

// ─── Structured HTTP Request Logger ──────────────────────────────────────────
// pino-http logs every incoming request as a structured JSON object.
// In development it's pretty-printed. In production it's one JSON line
// per request, suitable for Datadog / CloudWatch / ELK ingestion.
app.use(pinoHttp({
  logger,
  // Only log at warn level for health check polls to reduce noise
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400)       return "warn";
    if (req.url === "/")             return "trace"; // Health checks are very noisy
    return "info";
  },
  // Redact sensitive headers from request logs
  redact: ["req.headers.authorization", "req.headers.cookie"],
}));

// ─── Global Middleware ────────────────────────────────────────────────────────

// CORS — restrict to known origins in production.
const allowedOrigins = [
  env.CLIENT_URL,         // e.g. http://localhost:3000 in dev
  "http://10.0.2.2:5000", // Android emulator loopback
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development allow all — in production be strict
    if (env.NODE_ENV !== "production") return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Parse incoming JSON request bodies (e.g. req.body)
// Limit body size to 10kb to guard against large-payload attacks
app.use(express.json({ limit: "10kb" }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── NoSQL Injection Sanitization ─────────────────────────────────────────────
// Strips '$' and '.' from request body, query params, and route params
// to prevent attackers from injecting MongoDB operator keys into queries.
app.use(mongoSanitize());

// Serve uploaded files (profile pictures, resumes) as static files.
// Only used when CLOUDINARY_URL is not set (local dev mode).
// In production with Cloudinary, files are served directly from the CDN.
if (!env.CLOUDINARY_URL) {
  app.get('/uploads/:folder/:filename', (req, res, next) => {
    if (env.NODE_ENV !== 'production') return next();
    return require('./middleware/databaseUpload').serveDatabaseUpload(req, res, next);
  });
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
}

// Remove empty _id field from request body if sent by mistake
// (Android app sometimes sends an empty _id which breaks Mongoose)
app.use((req, res, next) => {
  if (req.body && req.body._id === "") {
    delete req.body._id;
  }
  next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Apply the global limiter to all routes (baseline abuse protection)
app.use(globalLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusVault Backend Running",
    env:     env.NODE_ENV,
    version: "1.0.0",
  });
});
app.use(legalPages);

// ─── API Routes ───────────────────────────────────────────────────────────────

// Auth routes get the strict brute-force rate limiter applied first
app.use("/api/auth",          authLimiter, authRoutes);

app.use("/api/gigs",          gigRoutes);
app.use("/api/applications",  applicationRoutes);
app.use("/api/chat",          chatRoutes);
app.use("/api/communities",   communityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/users",         userRoutes);
app.use("/api/messages",      messageRoutes);
app.use("/api/feedback",      feedbackRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success:   false,
    message:   `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// MUST be the very last middleware registered
app.use(errorHandler);

module.exports = app;

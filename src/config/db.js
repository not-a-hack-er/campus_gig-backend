// ============================================================
// config/db.js — Production-Grade MongoDB Connection
//
// Exports a single function `connectDB` that connects
// to MongoDB with production connection pooling & resiliency.
// Called once at server startup (in server.js).
//
// High-Scale Production Features:
//   - Connection Pool: maxPoolSize 100 / minPoolSize 10
//     Allows up to 100 simultaneous DB operations per server process,
//     keeping 10 warm connections ready at all times.
//   - Connection Resilience: automatically attempts reconnection if
//     the DB drops connection temporarily.
//   - Fail-Fast Timeouts: serverSelectionTimeoutMS (5s) prevents
//     requests from hanging indefinitely if DB is unreachable.
// ============================================================

const mongoose = require("mongoose");
const { env }  = require("./env");
const logger   = require("./logger");

const connectDB = async () => {
  try {
    // ── Mongoose Event Listeners for Production Monitoring ────────────────────
    mongoose.connection.on("error", (err) => {
      logger.error({ err }, "MongoDB connection error event");
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB connection lost — attempting automatic reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected successfully");
    });

    // ── Production Connection Pool & Options ─────────────────────────────────
    const options = {
      maxPoolSize:            100,  // Maintain up to 100 socket connections
      minPoolSize:            10,   // Keep at least 10 connections warm
      serverSelectionTimeoutMS: 5000, // Fail fast after 5s if DB unreachable
      socketTimeoutMS:        45000, // Close sockets after 45s of inactivity
      family:                 4,     // Use IPv4
    };

    const connection = await mongoose.connect(env.MONGODB_URI, options);
    logger.info({ host: connection.connection.host, poolSize: 100 }, "MongoDB connected (Connection Pool Active)");
  } catch (error) {
    logger.fatal({ err: error }, "MongoDB initial connection failed");
    process.exit(1); // Stop the app if DB can't connect
  }
};

module.exports = connectDB;

// ============================================================
// server.js — Entry point of the CampusVault backend
//
// What this file does:
//   1. Connects to MongoDB
//   2. Creates an HTTP server using Express
//   3. Attaches Socket.IO for real-time chat
//   4. Conditionally attaches Redis adapter for horizontal scaling
//      (when REDIS_URL env var is set)
//   5. Starts listening on the configured port
//   6. Handles graceful shutdown (SIGTERM / SIGINT)
//      — closes HTTP server, Socket.IO, and MongoDB connection
//   7. Catches unhandled promise rejections / uncaught exceptions
// ============================================================

const http = require("http");
const os   = require("os");
const { Server } = require("socket.io");

const app            = require("./app");
const connectDB      = require("./config/db");
const { env }        = require("./config/env");
const logger         = require("./config/logger");
const chatSocket     = require("./sockets/chatSocket");
const presenceSocket = require("./sockets/presenceSocket");
const { startGigCompletionScheduler } = require("./services/gigCompletionScheduler");
const { startKeepAlive }             = require("./services/keepAlive");

// ─── Global Safety Net ────────────────────────────────────────────────────────
// These catch any error that escapes the normal try/catch flow.
// In production a process manager (PM2 / systemd) will restart the process.

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception — process will exit");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled Promise Rejection — process will exit");
  process.exit(1);
});

// Main startup function (async so we can await DB connection)
const startServer = async () => {
  try {
    // Step 1: Connect to MongoDB first
    await connectDB();

    // Step 2: Wrap the Express app in a raw HTTP server
    // (Socket.IO needs a raw http.Server, not just Express)
    const server = http.createServer(app);

    // Step 3: Attach Socket.IO to the HTTP server
    const io = new Server(server, {
      pingInterval:       25000, // Send heartbeat every 25s
      pingTimeout:        20000, // Disconnect client if no heartbeat response within 20s
      maxHttpBufferSize:  1e6,   // Max packet size: 1 MB (prevents memory exhaustion)
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true); // Mobile apps have no origin
          if (origin === env.CLIENT_URL) return callback(null, true);
          if (env.NODE_ENV !== "production") return callback(null, true);
          callback(new Error(`Socket.IO CORS: origin ${origin} not allowed`));
        },
        methods: ["GET", "POST"],
      },
    });

    // ── Step 4: Conditionally attach Redis adapter ──────────────────────────
    // When REDIS_URL is set, Socket.IO events are routed through Redis Pub/Sub.
    // This enables horizontal scaling — multiple server processes or containers
    // can all share socket rooms and emit events to each other's clients.
    //
    // Without Redis (single-server / local dev): works normally with in-memory state.
    // With Redis (production multi-instance):    all instances share state via Redis.
    if (env.REDIS_URL) {
      const { createAdapter } = require("@socket.io/redis-adapter");
      const { createClient  } = require("ioredis");

      // Create two Redis connections: one for publishing, one for subscribing
      const pubClient = createClient(env.REDIS_URL);
      const subClient = pubClient.duplicate();

      // Connect both clients before attaching the adapter
      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));
      logger.info({ redisUrl: env.REDIS_URL.replace(/:\/\/.*@/, "://<credentials>@") },
        "Socket.IO Redis adapter attached — multi-instance scaling enabled");

      // Ensure Redis connections are closed during shutdown
      server._redisClients = [pubClient, subClient];
    } else {
      logger.info("Socket.IO using in-memory adapter (single-server mode)");
    }

    // Step 5: Register socket event handlers
    const socketService = require("./sockets/socketService");
    socketService.setIo(io);
    chatSocket(io);      // Handles real-time chat messages
    presenceSocket(io);  // Handles online/offline user status

    // Step 6: Start the gig completion scheduler (auto-approve after 3 days)
    // Must start AFTER DB connection so Mongoose models are ready.
    startGigCompletionScheduler();
    startKeepAlive(); // Prevent Render free-tier sleep
    const HOST = "0.0.0.0";
    server.listen(env.PORT, HOST, () => {
      const networkInterfaces = os.networkInterfaces();
      let lanIP = "localhost";
      for (const iface of Object.values(networkInterfaces)) {
        for (const addr of iface) {
          if (addr.family === "IPv4" && !addr.internal) {
            lanIP = addr.address;
            break;
          }
        }
        if (lanIP !== "localhost") break;
      }

      logger.info(`\n✅ Server Running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`🖥️  Local:            http://localhost:${env.PORT}`);
      logger.info(`📱 Android Emulator: http://10.0.2.2:${env.PORT}`);
      logger.info(`📶 Physical Device:  http://${lanIP}:${env.PORT}\n`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────
    // Closes all open connections in order:
    //   1. Stop accepting new HTTP connections (server.close)
    //   2. Close Socket.IO connections
    //   3. Close Redis pub/sub clients (if in use)
    //   4. Close MongoDB connection
    //   5. Exit the process
    //
    // This ensures in-flight requests can complete and DB writes are flushed
    // before the process exits.

    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);

      // Force-exit after 10 seconds if graceful shutdown hangs
      const forceExit = setTimeout(() => {
        logger.error("Forced shutdown after timeout — some connections may be lost");
        process.exit(1);
      }, 10_000);
      forceExit.unref(); // Don't let this timer prevent a clean exit

      try {
        // Stop HTTP server from accepting new connections
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
        logger.info("HTTP server closed");

        // Close Socket.IO connections
        await io.close();
        logger.info("Socket.IO closed");

        // Close Redis clients if they were opened
        if (server._redisClients) {
          await Promise.all(server._redisClients.map((c) => c.quit()));
          logger.info("Redis clients closed");
        }

        // Close MongoDB connection — allows any pending writes to flush
        const mongoose = require("mongoose");
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");

        logger.info("Graceful shutdown complete ✅");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));

  } catch (error) {
    logger.fatal({ err: error }, "Server failed to start");
    process.exit(1);
  }
};

startServer();
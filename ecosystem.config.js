// ============================================================
// ecosystem.config.js — PM2 Process Manager Cluster Configuration
//
// Usage in Production:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 status
//   pm2 logs
//
// What Cluster Mode does:
//   Node.js runs single-threaded per process. Cluster mode spawns
//   one Node process per CPU core (e.g. 4 cores = 4 workers)
//   and automatically balances incoming HTTP traffic across them.
//   If one worker crashes, PM2 restarts it instantly with zero downtime.
// ============================================================

module.exports = {
  apps: [
    {
      name:               "campus-gig-backend",
      script:             "src/server.js",
      instances:          "max",       // Use all available CPU cores
      exec_mode:          "cluster",   // Enable load balanced cluster mode
      autorestart:        true,
      watch:              false,       // Do not watch files in production
      max_memory_restart: "500M",      // Restart worker if memory exceeds 500MB
      env_production: {
        NODE_ENV:  "production",
        PORT:      5000,
      },
    },
  ],
};

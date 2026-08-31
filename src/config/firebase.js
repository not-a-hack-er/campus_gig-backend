// ============================================================
// config/firebase.js — Firebase Admin SDK Initializer
//
// Initializes Firebase Admin SDK using FIREBASE_SERVICE_ACCOUNT_KEY
// from environment variables or serviceAccountKey.json file.
//
// SAFE FALLBACK:
//   If credentials are not supplied, logs a warning and exports null.
//   The notification service checks for null before attempting push,
//   ensuring the server never crashes due to missing credentials in dev.
// ============================================================

const fs   = require("fs");
const path = require("path");
const logger = require("./logger");

let messaging = null;

try {
  const { initializeApp, cert, getApps } = require("firebase-admin/app");
  const { getMessaging }                = require("firebase-admin/messaging");

  const envServiceKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const filePath = path.join(__dirname, "../../serviceAccountKey.json");

  let serviceAccount = null;

  if (envServiceKey) {
    try {
      // Check if environment variable is raw JSON string or path
      if (envServiceKey.trim().startsWith("{")) {
        serviceAccount = JSON.parse(envServiceKey);
      } else if (fs.existsSync(envServiceKey)) {
        serviceAccount = require(path.resolve(envServiceKey));
      }
    } catch (err) {
      logger.error(`❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY from env: ${err.message}`);
    }
  }

  // Fallback to serviceAccountKey.json in root if env variable wasn't set or failed
  if (!serviceAccount && fs.existsSync(filePath)) {
    try {
      serviceAccount = require(filePath);
    } catch (err) {
      logger.error(`❌ Failed to load serviceAccountKey.json: ${err.message}`);
    }
  }

  if (serviceAccount) {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    messaging = getMessaging();
    logger.info("✅ Firebase Admin SDK initialized successfully for FCM Push Notifications");
  } else {
    logger.warn("⚠️  FIREBASE_SERVICE_ACCOUNT_KEY not provided — FCM Push Notifications are disabled");
  }
} catch (err) {
  logger.warn(`⚠️  Firebase Admin SDK initialization skipped or failed: ${err.message}`);
  messaging = null;
}

module.exports = {
  messaging,
  isFirebaseConfigured: () => messaging !== null,
};

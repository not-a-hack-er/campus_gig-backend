// ============================================================
// routes/webhookRoutes.js — Clerk Webhook Endpoint
//
// NOTE: This route must receive the RAW request body (not parsed JSON)
// so svix can verify the HMAC signature. The raw body middleware is
// applied in app.js BEFORE express.json(), specifically for this path.
// ============================================================

const express = require("express");
const router  = express.Router();
const { handleClerkWebhook } = require("../controllers/webhookController");

// POST /api/webhooks/clerk
// Receives Clerk user lifecycle events (user.created, user.updated, user.deleted).
router.post("/clerk", handleClerkWebhook);

module.exports = router;

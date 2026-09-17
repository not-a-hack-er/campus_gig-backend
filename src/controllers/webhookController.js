// ============================================================
// controllers/webhookController.js — Clerk User Lifecycle Sync
//
// Handles Clerk webhook events to keep the MongoDB User collection
// in sync with Clerk's user database.
//
// Events handled:
//   user.created — Create a skeleton User profile in MongoDB.
//   user.updated — Sync email and name changes from Clerk.
//   user.deleted — Soft-delete: set isActive = false.
//
// Security: Every request is verified using the svix signature
// before any payload is processed. Unverified requests are rejected.
//
// Idempotency: All writes use findOneAndUpdate with upsert where
// appropriate — safe to receive the same event more than once.
// ============================================================

const { Webhook } = require("svix");
const { env }     = require("../config/env");
const User        = require("../models/User");
const logger      = require("../config/logger");

// POST /api/webhooks/clerk
// Express must receive this with the raw body (not parsed JSON).
// See app.js for the raw body middleware applied to this route.
const handleClerkWebhook = async (req, res) => {
  // ── Step 1: Verify svix signature ──────────────────────────────────────────
  const webhookSecret = env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // In development without a webhook secret, log a warning and process anyway.
    // In production this should never happen (env.js warns at startup).
    if (env.NODE_ENV === "production") {
      logger.warn("Clerk webhook received but CLERK_WEBHOOK_SECRET is not set. Rejecting.");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }
    logger.warn("CLERK_WEBHOOK_SECRET not set — skipping signature verification in development");
  } else {
    const svixId        = req.headers["svix-id"];
    const svixTimestamp = req.headers["svix-timestamp"];
    const svixSignature = req.headers["svix-signature"];

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: "Missing svix headers" });
    }

    const wh = new Webhook(webhookSecret);
    try {
      // Verify using the raw body buffer (not the parsed JSON body)
      wh.verify(req.rawBody, {
        "svix-id":        svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (err) {
      logger.warn({ err }, "Clerk webhook signature verification failed");
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  // ── Step 2: Process the event ──────────────────────────────────────────────
  const { type, data } = req.body;
  logger.info({ type, clerkUserId: data?.id }, "Clerk webhook received");

  try {
    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;

      case "user.updated":
        await handleUserUpdated(data);
        break;

      case "user.deleted":
        await handleUserDeleted(data);
        break;

      default:
        // Ignore unknown events — Clerk may send others (session.created, etc.)
        logger.info({ type }, "Unhandled Clerk webhook event — ignoring");
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, type }, "Error processing Clerk webhook");
    // Return 500 so Clerk retries the event
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// ── user.created ──────────────────────────────────────────────────────────────
// Creates a skeleton User profile in MongoDB with profileComplete: false.
// Uses upsert so duplicate webhook deliveries are safe.
async function handleUserCreated(data) {
  const clerkUserId = data.id;
  const email       = data.email_addresses?.[0]?.email_address || "";
  const name        = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
                   || email.split("@")[0];

  // findOneAndUpdate with upsert prevents duplicate users if the webhook is
  // delivered more than once (Clerk guarantees at-least-once delivery).
  const user = await User.findOneAndUpdate(
    { clerkUserId },
    {
      $setOnInsert: {
        clerkUserId,
        email:           email.toLowerCase(),
        name:            name || "CampusVault User",
        profileComplete: false,
        isVerified:      true,  // Clerk verifies emails before creating users
        isActive:        true,
        role:            "student", // default; user picks final role on profile completion
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info({ clerkUserId, userId: user._id }, "User profile created from Clerk webhook");
}

// ── user.updated ──────────────────────────────────────────────────────────────
// Syncs email and name from Clerk → MongoDB when a user updates their Clerk account.
async function handleUserUpdated(data) {
  const clerkUserId = data.id;
  const email       = data.email_addresses?.[0]?.email_address;
  const name        = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();

  const updates = {};
  if (email) updates.email = email.toLowerCase();
  if (name)  updates.name  = name;

  if (Object.keys(updates).length === 0) return;

  const result = await User.findOneAndUpdate(
    { clerkUserId },
    { $set: updates },
    { new: true }
  );

  if (result) {
    logger.info({ clerkUserId, updates }, "User profile synced from Clerk webhook");
  } else {
    // User doesn't exist yet — could happen if webhook arrived out of order.
    // The /api/auth/sync endpoint (called on first sign-in) handles this case.
    logger.warn({ clerkUserId }, "user.updated webhook — no matching MongoDB user found");
  }
}

// ── user.deleted ──────────────────────────────────────────────────────────────
// Soft-deletes the MongoDB user by setting isActive = false.
// We do NOT hard-delete so that gigs, reviews, and messages remain intact.
async function handleUserDeleted(data) {
  const clerkUserId = data.id;

  const result = await User.findOneAndUpdate(
    { clerkUserId },
    { $set: { isActive: false } },
    { new: true }
  );

  if (result) {
    logger.info({ clerkUserId, userId: result._id }, "User deactivated from Clerk webhook");
  } else {
    logger.warn({ clerkUserId }, "user.deleted webhook — no matching MongoDB user found");
  }
}

module.exports = { handleClerkWebhook };

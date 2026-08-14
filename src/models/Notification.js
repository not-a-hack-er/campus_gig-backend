// ============================================================
// models/Notification.js — User Notification Schema
//
// Notifications are messages sent to a user about events
// like "Your application was accepted!" or "New review received".
// ============================================================

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // The user who should receive this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title:   { type: String, required: true }, // Short heading, e.g. "Application Accepted!"
    body:    { type: String, required: true }, // Full message text

    // Category of notification, e.g. "application_status"
    type: { type: String, default: "" },

    // ID of the related document (e.g. the application ID)
    referenceId:   { type: String, default: "" },
    referenceType: { type: String, default: "" }, // e.g. "Application"

    // Has the user seen this notification?
    isRead: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// ── Database Indexes ──────────────────────────────────────────────────────────
//
// Compound index on {recipient, createdAt}:
//   - Matches the EXACT query pattern used by getNotifications():
//       Notification.find({ recipient: userId }).sort({ createdAt: -1 })
//   - Without this index, MongoDB scans ALL notifications for every fetch.
//
// Compound index on {recipient, isRead}:
//   - Speeds up markAllAsRead(): updateMany({ recipient, isRead: false })
//   - Speeds up unread-count queries if added in the future
//
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

// ─── Virtual Field ────────────────────────────────────────────────────────────

// "message" is an alias for "body" (backwards compatibility with older code)
notificationSchema.virtual("message")
  .get(function () { return this.body; })
  .set(function (val) { this.body = val; });

// ─── JSON Serialization ───────────────────────────────────────────────────────

notificationSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.id;
    return ret;
  },
});

notificationSchema.set("toObject", { virtuals: true, getters: true });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;

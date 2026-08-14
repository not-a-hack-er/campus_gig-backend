// ============================================================
// models/Message.js — A Single Chat Message
//
// Each message belongs to a Conversation and was sent by a User.
// Messages are sorted by createdAt to show them in order.
// ============================================================

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // Which conversation this message belongs to
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    // Who sent the message
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The text of the message
    content: { type: String, required: true },

    // Whether the message has been read by the recipient
    isRead: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// ── Database Index ────────────────────────────────────────────────────────────
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, isRead: 1 });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;

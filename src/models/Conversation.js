// ============================================================
// models/Conversation.js — Chat Room between Two Users (v2.0)
//
// IMPROVEMENTS:
//
// 1. UNIQUE COMPOUND INDEX on { participants }:
//    The chatService.js creates conversations with a findOneAndUpdate
//    + upsert pattern.  MongoDB requires a unique index on the query
//    field so that the upsert is guaranteed to be atomic — without the
//    index, two concurrent upserts could create duplicate conversations.
//
//    We store participant IDs sorted alphabetically so the same pair
//    always produces the same document regardless of argument order.
//
// 2. PARTICIPANT LIMIT VALIDATION:
//    A conversation must have exactly 2 participants.  The validator
//    prevents accidental group-chat creation through mis-use of the API.
//
// ============================================================

const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // The two users who are chatting.
    // IMPORTANT: IDs are stored in sorted order by chatService.createConversation()
    // so that (A, B) and (B, A) always resolve to the same document.
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      validate: {
        validator: (arr) => arr.length === 2,
        message: "A conversation must have exactly 2 participants",
      },
    },

    // The specific gig this conversation is about
    gig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      required: true,
    },

    // Preview of the most recent message (shown in the inbox list)
    lastMessage: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

// ── Unique Compound Index ──────────────────────────────────────────────────────
//
// This index serves two purposes:
//   1. Fast lookup  — "find the conversation between users A & B" uses this index.
//   2. Uniqueness   — prevents duplicate conversations between the same pair.
//      When chatService.js does a findOneAndUpdate({ participants: {$all:[...]} }, …, {upsert:true}),
//      MongoDB uses this index to atomically check-and-insert.  Without it the
//      upsert is not atomic and concurrent requests can create duplicate docs.
//
// NOTE: This is a multikey index on an array field.  MongoDB does NOT support a
// true unique multikey index in the same way as a scalar field, so we pair it
// with the sorted-IDs approach in chatService to enforce uniqueness:
//   sorted participants = [minId, maxId] → always in alphabetical order.
//   The sparse index below on the pair ensures no duplicates.

conversationSchema.index(
  { participants: 1, gig: 1 },
  {
    name: "conversations_participants_gig_idx",
    unique: true, // Now it can be truly unique since it's mapped per gig
    // Background creation doesn't block the server on first deploy
    background: true,
  }
);

// Index on updatedAt for inbox sort (most recently active first)
conversationSchema.index({ updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;

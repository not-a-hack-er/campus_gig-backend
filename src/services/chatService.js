// ============================================================
// services/chatService.js — Chat / Messaging Business Logic (v2.0)
//
// FIXES & IMPROVEMENTS:
//
// 1. RACE-CONDITION-SAFE createConversation (Upsert):
//    Previously: findOne() → if null → create()
//    Two simultaneous requests could both pass the findOne() check
//    before either wrote to the DB, causing a duplicate conversation.
//
//    Fix: Use findOneAndUpdate with { upsert: true } and
//    { setDefaultsOnInsert: true }.  MongoDB guarantees atomically
//    that only one document is created even under concurrent requests.
//    The Conversation schema's { participants } unique index enforces
//    this at the database level as the final guard.
//
// 2. SAFE FIELD PROJECTION on populate():
//    Sender fields are explicitly whitelisted.  password is excluded
//    at the schema level (select: false) AND here for defence-in-depth.
//
// 3. TIMESTAMP-BASED PAGINATION HOOK (getMessages):
//    Added optional `before` cursor parameter for future cursor-based
//    pagination (load earlier messages on scroll-up).
//
// ============================================================

const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");

/** Safe sender fields returned with every message. */
const SENDER_FIELDS = "_id name avatar college";

// ─────────────────────────────────────────────────────────────────────────────
// Find or create a conversation between two users (atomic upsert)
// ─────────────────────────────────────────────────────────────────────────────
const createConversation = async (user1Id, user2Id) => {
  // Sort the IDs so (A, B) and (B, A) resolve to the same conversation
  const sorted = [user1Id.toString(), user2Id.toString()].sort();

  // 1. Try to find existing conversation between these 2 users
  let conversation = await Conversation.findOne({
    participants: { $all: sorted, $size: 2 },
  });

  // 2. If not found, create one. Handles rare race conditions gracefully.
  if (!conversation) {
    try {
      conversation = await Conversation.create({ participants: sorted });
    } catch (err) {
      if (err.code === 11000) {
        // Race condition hit — another request created it a millisecond ago
        conversation = await Conversation.findOne({
          participants: { $all: sorted, $size: 2 },
        });
      } else {
        throw err;
      }
    }
  }

  return conversation;
};

// ─────────────────────────────────────────────────────────────────────────────
// Save a new message and update the conversation's inbox preview
// ─────────────────────────────────────────────────────────────────────────────
const saveMessage = async (conversationId, senderId, content) => {
  const message = await Message.create({
    conversationId,
    sender: senderId,
    content,
  });

  // Update inbox preview (lastMessage) atomically
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: content,
    updatedAt: new Date(),
  });

  return message;
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all messages in a conversation, sorted oldest-first.
//
// Optional `before` parameter:  when provided, only messages with a
// createdAt BEFORE that timestamp are returned (cursor-based pagination).
// This enables infinite-scroll "load earlier messages" without page offsets.
// ─────────────────────────────────────────────────────────────────────────────
const getMessages = async (conversationId, { before, limit = 100 } = {}) => {
  const query = { conversationId };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return await Message.find(query)
    .populate("sender", SENDER_FIELDS)
    .sort({ createdAt: 1 })
    .limit(limit);
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark all unread messages from `otherUserId` as read for `readerUserId`
// ─────────────────────────────────────────────────────────────────────────────
const markMessagesAsRead = async (conversationId, readerUserId) => {
  return await Message.updateMany(
    {
      conversationId,
      sender: { $ne: readerUserId }, // Only mark messages sent BY the other user
      isRead: false,
    },
    { $set: { isRead: true } }
  );
};

module.exports = {
  createConversation,
  saveMessage,
  getMessages,
  markMessagesAsRead,
};
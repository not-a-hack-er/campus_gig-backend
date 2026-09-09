// ============================================================
// sockets/chatSocket.js — Real-time Chat via Socket.IO (v2.0)
//
// FIXES & IMPROVEMENTS:
//
// 1. SOCKET AUTHENTICATION HARDENED:
//    The middleware now validates that the token's decoded.id is a
//    non-empty string before assigning socket.user.  Previously an
//    attacker could connect with a crafted token whose payload had
//    id=undefined, bypassing the ID check in the handler.
//
// 2. RATE LIMITER LOGIC CORRECTED:
//    The previous rate-limiter used lastMessageAt=0 as a module-level
//    variable, meaning it was shared across sockets in rare edge cases.
//    It is now always initialised inside the connection callback so
//    each socket has its own independent counter.
//
// 3. SELECTIVE POPULATION:
//    populate() now uses an explicit safe field list. No internal field
//    (e.g. password) can ever leak through a chat message response.
//
// 4. EMIT DEDUPLICATION:
//    emit("new_message") to the sender's room already includes the
//    sender because they joined their own room on connect.  We now
//    guard against emitting the same message twice to the sender when
//    they are also the receiver (self-chat edge case).
//
// ============================================================

const jwt      = require("jsonwebtoken");
const { env }  = require("../config/env");
const {
  createConversation,
  saveMessage,
  markMessagesAsRead,
} = require("../services/chatService");
const { createNotification } = require("../services/notificationService");

// Safe fields that are allowed to travel with a chat message.
// NOTE: `password` is excluded via User schema's `select: false`, but we
// still whitelist here as a second layer of protection.
const MESSAGE_SENDER_FIELDS = "name avatar college";

const chatSocket = (io) => {

  // ── Authentication Middleware ─────────────────────────────────────────────
  // Runs before every connection.  Rejects any socket that lacks a valid JWT.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token || typeof token !== "string") {
      return next(new Error("Authentication Required: no token provided"));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (jwtErr) {
      const msg = jwtErr.name === "TokenExpiredError"
        ? "Authentication Required: token expired"
        : "Authentication Required: invalid token";
      return next(new Error(msg));
    }

    // Guard against tokens with a missing or malformed id claim
    if (!decoded.id || typeof decoded.id !== "string") {
      return next(new Error("Authentication Required: malformed token payload"));
    }

    try {
      const user = await require('../models/User').findById(decoded.id).select('isActive');
      if (!user || user.isActive === false) return next(new Error('Account unavailable'));
    } catch (_) { return next(new Error('Authentication failed')); }
    socket.user = { id: decoded.id };
    next();
  });

  // ── Connection Handler ────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.user.id;
    console.log(`[Socket] Connected: user=${userId} socket=${socket.id}`);

    // Each authenticated user joins a private room named after their user ID.
    // Direct messages are delivered to receiverId's room via io.to(receiverId).
    socket.join(userId);

    // Allow the client to explicitly join a conversation room
    socket.on("join_room", async (roomId) => {
      if (typeof roomId !== "string" || !roomId.trim()) return;
      if (roomId === userId) return socket.join(roomId);
      try {
        const allowed = await require('../models/Conversation').exists({ _id: roomId, participants: userId });
        if (allowed) socket.join(roomId);
      } catch (_) { /* Unknown rooms are never joined. */ }
    });

    // ── Per-socket message rate limiter ──────────────────────────────────────
    // Scoped inside the connection callback → each socket has its own counter.
    const MESSAGE_INTERVAL_MS = 500; // Min ms between messages (2 per second)
    let lastMessageAt = 0;

    // ── send_message ─────────────────────────────────────────────────────────
    socket.on("send_message", async (data) => {
      try {
        const { receiverId, gigId, content } = data || {};

        // Basic validation
        if (!receiverId || typeof receiverId !== "string" || !receiverId.trim()) return;
        if (!content   || typeof content    !== "string" || !content.trim())    return;

        // BUG-03 FIX: Require gigId before attempting to find/create a conversation.
        // The Conversation schema marks `gig` as required — calling createConversation
        // without a gigId causes Mongoose to throw a ValidationError: "Gig is required".
        if (!gigId || typeof gigId !== "string" || !gigId.trim()) {
          socket.emit("error", { message: "gigId is required to send a message." });
          return;
        }
        const validGigId = gigId.trim();

        // Rate-limit
        const now = Date.now();
        if (now - lastMessageAt < MESSAGE_INTERVAL_MS) {
          socket.emit("rate_limit_error", { message: "Sending too fast — slow down." });
          return;
        }
        lastMessageAt = now;

        // Resolve or create the conversation between the two users
        const conversation = await createConversation(userId, receiverId, validGigId);

        // Persist the message
        const saved = await saveMessage(conversation._id, userId, content.trim());

        // Attach sender profile (safe fields only)
        const populated = await saved.populate("sender", MESSAGE_SENDER_FIELDS);

        // Broadcast to receiver
        io.to(receiverId).emit("new_message", populated);

        // Also echo back to sender (multi-device sync).
        if (userId !== receiverId) {
          io.to(userId).emit("new_message", populated);
        }

        // Emit conversation update event to both users' rooms for real-time Inbox updates
        const convUpdate = {
          conversationId: conversation._id,
          lastMessage: content.trim(),
          updatedAt: new Date().toISOString(),
          senderId: userId,
          receiverId: receiverId,
        };
        io.to(receiverId).emit("conversation_updated", convUpdate);
        if (userId !== receiverId) {
          io.to(userId).emit("conversation_updated", convUpdate);
        }

        const senderName = populated.sender?.name || "Someone";
        await createNotification(
          receiverId,
          `New message from ${senderName}`,
          content.trim(),
          {
            type: "new_message",
            referenceId: conversation._id.toString(),
            referenceType: "Conversation",
            data: {
              senderId: userId,
              senderName,
              gigId: validGigId,
            },
          }
        );

      } catch (error) {
        console.error(`[Socket] send_message error (user=${userId}):`, error.message);
        socket.emit("error", { message: "Failed to send message. Please try again." });
      }
    });

    // ── typing indicator ─────────────────────────────────────────────────────
    socket.on("typing", (data) => {
      const { receiverId, gigId } = data || {};
      if (!receiverId || typeof receiverId !== "string") return;
      io.to(receiverId).emit("typing", userId);
    });

    // ── mark_read ─────────────────────────────────────────────────────────────
    // Client emits this when they open a conversation.
    socket.on("mark_read", async (data) => {
      try {
        const { senderId, gigId } = data || {};
        if (!senderId || typeof senderId !== "string") return;

        // BUG-06 FIX: Use findOne instead of createConversation.
        // mark_read should NEVER create a conversation as a side-effect.
        // If no conversation exists between these two users yet, there are
        // no messages to mark as read — simply return silently.
        const sorted = [userId, senderId].sort();
        const query = { participants: { $all: sorted, $size: 2 } };
        if (gigId && typeof gigId === "string" && gigId.trim()) {
          query.gig = gigId.trim();
        }

        const Conversation = require("../models/Conversation");
        let conversation = await Conversation.findOne(query);

        // Fallback: search by participants only if gigId search yielded nothing
        if (!conversation && gigId) {
          conversation = await Conversation.findOne({
            participants: { $all: sorted, $size: 2 },
          });
        }

        // No conversation exists yet — nothing to mark as read
        if (!conversation) return;

        await markMessagesAsRead(conversation._id, userId);

        // Notify the original sender so their outgoing checkmarks update live
        io.to(senderId).emit("messages_read", { readerId: userId });
      } catch (err) {
        console.error(`[Socket] mark_read error (user=${userId}):`, err.message);
      }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: user=${userId} socket=${socket.id} reason=${reason}`);
    });
  });
};

module.exports = chatSocket;

// ============================================================
// controllers/messageController.js — Inbox & Messages Handler
//
// Handles two things:
//   1. Getting the list of conversations the logged-in user is in (inbox)
//      — Each inbox item includes the OTHER user's profile AND the
//        lastMessage preview + timestamp, so the Android inbox list
//        can display a proper preview.
//   2. Getting all messages exchanged with a specific user
// ============================================================

const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const ApiResponse  = require("../utils/ApiResponse");

// GET /api/messages/conversations — Get the inbox (list of conversations)
// Returns each conversation's last message preview + the other participant's profile.
const getConversationsController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all conversations where this user is one of the two participants
    // Sort by updatedAt descending so the most recently active conversation appears first
    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "name email avatar bio college")
      .sort({ updatedAt: -1 });

    // Build the inbox list: for each conversation, return the other user's profile
    // plus the conversation metadata (lastMessage, updatedAt, _id)
    const inbox = conversations
      .map((conv) => {
        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== userId.toString()
        );

        // Skip conversations where we can't find the other participant
        if (!otherUser) return null;

        return {
          conversationId: conv._id,
          lastMessage:    conv.lastMessage || "",
          updatedAt:      conv.updatedAt,
          user:           otherUser,        // The other person's profile
        };
      })
      .filter(Boolean); // Remove any null entries

    return res.status(200).json(new ApiResponse(true, "Conversations Fetched", inbox));
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/:receiverId — Get all messages with a specific user
const getMessagesByReceiverController = async (req, res, next) => {
  try {
    const userId     = req.user.id;
    const receiverId = req.params.receiverId;

    // Find the conversation between the two users
    const conversation = await Conversation.findOne({
      participants: { $all: [userId, receiverId], $size: 2 }, // Must include EXACTLY BOTH users
    });

    // If no conversation exists yet, return an empty array (not an error)
    if (!conversation) {
      return res.status(200).json(new ApiResponse(true, "No messages yet", []));
    }

    // Mark messages sent by receiver as read by current user
    await Message.updateMany(
      { conversationId: conversation._id, sender: receiverId, isRead: false },
      { $set: { isRead: true } }
    );

    // Get all messages in this conversation, oldest first
    const messages = await Message.find({ conversationId: conversation._id })
      .populate("sender", "name email avatar")
      .sort({ createdAt: 1 });

    return res.status(200).json(new ApiResponse(true, "Messages Fetched", messages));
  } catch (error) {
    next(error);
  }
};

// PUT /api/messages/:receiverId/read — Explicitly mark messages read
const markMessagesReadController = async (req, res, next) => {
  try {
    const userId     = req.user.id;
    const receiverId = req.params.receiverId;

    const conversation = await Conversation.findOne({
      participants: { $all: [userId, receiverId], $size: 2 },
    });

    if (conversation) {
      await Message.updateMany(
        { conversationId: conversation._id, sender: receiverId, isRead: false },
        { $set: { isRead: true } }
      );
    }

    return res.status(200).json(new ApiResponse(true, "Messages marked as read", null));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversationsController,
  getMessagesByReceiverController,
  markMessagesReadController,
};

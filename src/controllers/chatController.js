// ============================================================
// controllers/chatController.js — Chat Request Handler
//
// Handles HTTP requests for starting conversations and
// fetching messages. Real-time messaging is handled separately
// in sockets/chatSocket.js via Socket.IO.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const ApiError    = require("../utils/ApiError");
const { createConversation, getMessages } = require("../services/chatService");

// POST /api/chat/conversation — Start a conversation with another user
// Body: { receiverId }
const createConversationController = async (req, res, next) => {
  try {
    const { receiverId, gigId } = req.body;

    // receiverId is required — without it we cannot create a meaningful conversation
    if (!receiverId || !gigId) {
      throw new ApiError(400, "receiverId and gigId are required");
    }

    // A user cannot start a conversation with themselves
    if (receiverId === req.user.id) {
      throw new ApiError(400, "You cannot start a conversation with yourself");
    }

    const conversation = await createConversation(req.user.id, receiverId, gigId);
    return res.status(201).json(new ApiResponse(true, "Conversation Created", conversation));
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/messages/:conversationId — Get all messages in a conversation
const getMessagesController = async (req, res, next) => {
  try {
    const messages = await getMessages(req.params.conversationId);
    return res.status(200).json(new ApiResponse(true, "Messages Fetched", messages));
  } catch (error) {
    next(error);
  }
};

module.exports = { createConversationController, getMessagesController };
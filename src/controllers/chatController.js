// ============================================================
// controllers/chatController.js — Chat Request Handler
//
// Handles HTTP requests for starting conversations and
// fetching messages. Real-time messaging is handled separately
// in sockets/chatSocket.js via Socket.IO.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const ApiError    = require("../utils/ApiError");
const { createConversation, getMessages, saveMessage } = require("../services/chatService");

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

// POST /api/chat/conversation/:conversationId/message — Send a message in an existing conversation
const sendMessageController = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      throw new ApiError(400, 'Message text is required');
    }

    const Conversation = require('../models/Conversation');
    const conversation = await Conversation.findById(conversationId).select('participants');
    if (!conversation) throw new ApiError(404, 'Conversation not found');
    if (!conversation.participants.some(id => String(id) === String(req.user.id))) {
      throw new ApiError(403, 'You are not a participant in this conversation');
    }

    const message = await saveMessage(conversationId, req.user.id, String(text).trim());
    await message.populate('sender', 'name avatar college');

    // Return the full updated message list so the client can refresh
    const messages = await getMessages(conversationId);
    return res.status(201).json(new ApiResponse(true, 'Message Sent', { message, messages }));
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/messages/:conversationId — Get all messages in a conversation
const getMessagesController = async (req, res, next) => {
  try {
    const Conversation = require('../models/Conversation');
    const conversation = await Conversation.findById(req.params.conversationId).select('participants');
    if (!conversation) throw new ApiError(404, 'Conversation not found');
    if (!conversation.participants.some(id => String(id) === String(req.user.id))) {
      throw new ApiError(403, 'You are not a participant in this conversation');
    }
    const messages = await getMessages(req.params.conversationId);
    return res.status(200).json(new ApiResponse(true, "Messages Fetched", messages));
  } catch (error) {
    next(error);
  }
};

module.exports = { createConversationController, sendMessageController, getMessagesController };

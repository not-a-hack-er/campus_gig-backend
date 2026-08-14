// ======================================================
// Message Routes
//
// IMPORTANT route ordering:
//   GET /inbox       — must be before /:receiverId so Express doesn't treat
//                      "inbox" as a receiverId param (wildcard swallows everything)
//   GET /:receiverId — get all messages with a specific user
// ======================================================

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  getConversationsController,
  getMessagesByReceiverController,
  markMessagesReadController,
} = require('../controllers/messageController');

// /inbox and /conversations must be declared first — before the /:receiverId wildcard
router.get('/inbox',           protect, getConversationsController);
router.get('/conversations',   protect, getConversationsController);
router.get('/:receiverId',     protect, getMessagesByReceiverController);
router.put('/:receiverId/read', protect, markMessagesReadController);

module.exports = router;

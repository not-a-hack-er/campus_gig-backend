const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  createConversationController,
  sendMessageController,
  getMessagesController,
} = require('../controllers/chatController');

router.post('/conversation',                              protect, createConversationController);
router.post('/conversation/:conversationId/message',      protect, sendMessageController);
router.get('/messages/:conversationId',                   protect, getMessagesController);

module.exports = router;

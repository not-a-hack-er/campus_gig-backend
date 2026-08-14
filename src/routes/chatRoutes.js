const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  createConversationController,
  getMessagesController,
} = require('../controllers/chatController');

router.post('/conversation',                   protect, createConversationController);
router.get('/messages/:conversationId',        protect, getMessagesController);

module.exports = router;

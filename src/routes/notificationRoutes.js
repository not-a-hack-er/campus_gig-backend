// ============================================================
// routes/notificationRoutes.js — Notification API Endpoints
//
// All routes require authentication (protect middleware).
// ============================================================

const express  = require("express");
const router   = express.Router();
const protect  = require("../middleware/auth");
const { rateLimit } = require('express-rate-limit');
const {
  getNotificationsController,
  markAsReadController,
  markAllNotificationsReadController,
  getUnreadCountController,
} = require("../controllers/notificationController");

router.get("/",                       protect, getNotificationsController);        // Get all notifications
router.post('/test', protect, rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: req => req.user.id }), async (req, res, next) => {
  try {
    const notification = await require('../services/notificationService').createNotification(
      req.user.id, 'CampusVault notification test', 'Push notification test from the CampusVault server.', { type: 'system' }
    );
    res.json({ delivery: notification.$locals.pushDelivery, notificationId: notification._id });
  } catch (error) { next(error); }
});
router.get("/unread-count",           protect, getUnreadCountController);           // Count of unread notifications (for badge/dot)
router.put("/read-all",               protect, markAllNotificationsReadController); // Mark all as read
router.patch("/:notificationId/read", protect, markAsReadController);              // Mark one as read
router.put("/:notificationId/read",   protect, markAsReadController);              // Same (supports both PUT and PATCH)

module.exports = router;

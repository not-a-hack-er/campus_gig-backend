// ============================================================
// routes/notificationRoutes.js — Notification API Endpoints
//
// All routes require authentication (protect middleware).
// ============================================================

const express  = require("express");
const router   = express.Router();
const protect  = require("../middleware/auth");
const {
  getNotificationsController,
  markAsReadController,
  markAllNotificationsReadController,
} = require("../controllers/notificationController");

router.get("/",                       protect, getNotificationsController);        // Get all notifications
router.put("/read-all",               protect, markAllNotificationsReadController); // Mark all as read
router.patch("/:notificationId/read", protect, markAsReadController);              // Mark one as read
router.put("/:notificationId/read",   protect, markAsReadController);              // Same (supports both PUT and PATCH)

module.exports = router;
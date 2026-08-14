// ============================================================
// controllers/notificationController.js — Notification Request Handler
//
// Handles HTTP requests for fetching and marking notifications.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require("../services/notificationService");

// GET /api/notifications — Get all notifications for the logged-in user
const getNotificationsController = async (req, res, next) => {
  try {
    const notifications = await getNotifications(req.user.id);
    return res.status(200).json(new ApiResponse(true, "Notifications Fetched", notifications));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/notifications/:notificationId/read — Mark one notification as read
// Only the notification's recipient can mark it as read.
const markAsReadController = async (req, res, next) => {
  try {
    const notification = await markAsRead(req.params.notificationId, req.user.id);
    return res.status(200).json(new ApiResponse(true, "Marked as Read", notification));
  } catch (error) {
    next(error);
  }
};

// PUT /api/notifications/read-all — Mark all notifications as read
const markAllNotificationsReadController = async (req, res, next) => {
  try {
    const result = await markAllAsRead(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationsController,
  markAsReadController,
  markAllNotificationsReadController,
};
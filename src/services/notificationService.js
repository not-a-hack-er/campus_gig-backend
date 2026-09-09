// ============================================================
// services/notificationService.js — Notification Business Logic
//
// Creates and retrieves in-app notifications.
// A notification is sent to a user when something important happens,
// e.g. "Your application was accepted."
//
// Note: The Notification model stores the text in a field called "body".
// We always write to "body" to avoid confusion with the virtual "message" alias.
// ============================================================

const Notification = require("../models/Notification");
const User         = require("../models/User");
const ApiError     = require("../utils/ApiError");

const { emitToUser }                  = require("../sockets/socketService");
const { messaging, isFirebaseConfigured } = require("../config/firebase");

// Create a notification for a user
// Parameters:
//   recipient   — the user ID who will see the notification
//   title       — short heading, e.g. "Application Accepted!"
//   message     — full message body text
//   options     — optional metadata (type, referenceId, referenceType)
const createNotification = async (
  recipient,
  title,
  message,
  { type = "", referenceId = "", referenceType = "", data = {} } = {}
) => {
  const stringData = Object.fromEntries(
    Object.entries(data || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
  const notification = await Notification.create({
    recipient,
    title,
    body: message, // "body" is the actual DB field name
    type,
    referenceId,
    referenceType,
    data: stringData,
  });

  // 1. Emit instantly to recipient's private socket room (if connected online)
  try {
    emitToUser(recipient, "new_notification", notification);
  } catch (err) {
    console.error("[createNotification] Socket emit error:", err.message);
  }

  // 2. Dispatch FCM Push Notification to recipient's mobile device (if fcmToken exists)
  if (isFirebaseConfigured()) {
    try {
      const recipientUser = await User.findById(recipient).select("fcmToken");
      if (recipientUser && recipientUser.fcmToken) {
        const payload = {
          token: recipientUser.fcmToken,
          notification: {
            title: title,
            body: message,
          },
          data: {
            notificationId: notification._id.toString(),
            type: type || "",
            referenceId: referenceId ? String(referenceId) : "",
            referenceType: referenceType || "",
            ...stringData,
          },
          android: {
            priority: "high",
            notification: {
              sound: "default",
              channelId: "campusvault_general",
            },
          },
        };

        await messaging.send(payload);
      }
    } catch (fcmErr) {
      // Auto-clean stale or expired FCM tokens
      if (
        fcmErr.code === "messaging/registration-token-not-registered" ||
        fcmErr.code === "messaging/invalid-registration-token"
      ) {
        await User.findByIdAndUpdate(recipient, { $set: { fcmToken: "" } });
      }
      console.error("[createNotification] FCM Push error:", fcmErr.message);
    }
  }

  return notification;
};

// Get all notifications for a user (newest first)
const getNotifications = async (userId) => {
  return await Notification.find({ recipient: userId }).sort({ createdAt: -1 });
};

// Mark a single notification as read
// Verifies the notification belongs to the calling user before updating.
// Returns 403 if the notification belongs to someone else.
// Returns 404 if the notification does not exist.
const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  // Security: only the recipient can mark their own notification as read
  if (notification.recipient.toString() !== userId.toString()) {
    throw new ApiError(403, "You are not authorized to update this notification");
  }

  notification.isRead = true;
  await notification.save();

  return notification;
};

// Mark all unread notifications for a user as read
const markAllAsRead = async (userId) => {
  await Notification.updateMany(
    { recipient: userId, isRead: false }, // Find all unread ones for this user
    { isRead: true }                       // Set them all to read
  );
  return { message: "All notifications marked as read" };
};

// Get the count of unread notifications for a user
// Used by the mobile app to control whether to show the red dot / badge.
// Returns 0 if there are no unread notifications.
const getUnreadCount = async (userId) => {
  const count = await Notification.countDocuments({ recipient: userId, isRead: false });
  return { unreadCount: count };
};

module.exports = { createNotification, getNotifications, markAsRead, markAllAsRead, getUnreadCount };

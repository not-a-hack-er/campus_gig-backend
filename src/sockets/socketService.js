// ============================================================
// sockets/socketService.js — Global Socket Helper
//
// Allows any part of the backend (services, controllers)
// to emit real-time WebSocket events to connected users.
// ============================================================

let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const getIo = () => {
  return ioInstance;
};

/**
 * Emits a socket event directly to a specific user's private room.
 * In chatSocket.js, every user joins a room named after their userId.
 *
 * @param {string} userId — Recipient's MongoDB ID
 * @param {string} eventName — Name of the socket event
 * @param {object} data — Payload to transmit
 */
const emitToUser = (userId, eventName, data) => {
  if (ioInstance && userId) {
    ioInstance.to(userId.toString()).emit(eventName, data);
    console.log(`[SocketService] Emitted ${eventName} to user room ${userId}`);
  }
};

module.exports = {
  setIo,
  getIo,
  emitToUser,
};

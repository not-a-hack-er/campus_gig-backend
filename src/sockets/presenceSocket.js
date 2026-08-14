// ============================================================
// sockets/presenceSocket.js — Online User Tracking (v2.0)
//
// ARCHITECTURE CHANGE (multi-socket support):
//   A user can be logged in on multiple devices/tabs at once.
//   Previously, each new connection REPLACED the old socket ID in onlineUsers{},
//   so logging in on a second device would make the first appear "offline"
//   even though it was still connected. And on disconnect the user would
//   vanish from online_users even if they still had another socket alive.
//
//   Fix: Track a Set of socket IDs per user, not a single socket ID.
//     onlineUsers = Map<userId, Set<socketId>>
//   A user is "online" as long as their Set has at least one socket ID.
//   They only become "offline" when their Set becomes empty.
//
// Security: userId is always read from the authenticated socket.user,
// never from a client-supplied payload.
//
// Socket events:
//   Client → Server: "user_online"   (no payload — userId from JWT)
//   Client → Server: "get_online_users"
//   Server → All:    "online_users"  [userId, userId, ...]
// ============================================================

/** Map of userId → Set<socketId>. Reset on server restart. */
const onlineUsers = new Map();

/**
 * Returns the current list of unique online user IDs.
 * @returns {string[]}
 */
const getOnlineUserIds = () => Array.from(onlineUsers.keys());

/**
 * Broadcasts the updated online-user list to all connected sockets.
 * Centralised so we never forget to broadcast after any mutation.
 * @param {import("socket.io").Server} io
 */
const broadcastOnlineUsers = (io) => {
  io.emit("online_users", getOnlineUserIds());
};

/**
 * Registers a socket for a userId — adds socket.id to that user's Set.
 * @param {string} userId
 * @param {string} socketId
 */
const addSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
};

/**
 * Removes a socket from a user's Set.
 * If the Set becomes empty the user is considered offline and removed.
 * @param {string} userId
 * @param {string} socketId
 */
const removeSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
  }
};

const presenceSocket = (io) => {
  io.on("connection", (socket) => {
    // socket.user is attached by chatSocket.js's JWT middleware
    const authenticatedUserId = socket.user?.id;
    if (!authenticatedUserId) return;

    // Register this socket for the user
    addSocket(authenticatedUserId, socket.id);
    broadcastOnlineUsers(io);

    // Let the client explicitly re-request the current list (e.g. after re-connect)
    socket.on("get_online_users", () => {
      socket.emit("online_users", getOnlineUserIds());
    });

    // Heartbeat / re-announce — client can call this to re-add themselves
    socket.on("user_online", () => {
      addSocket(authenticatedUserId, socket.id);
      broadcastOnlineUsers(io);
    });

    // Clean-up: remove this socket on disconnect
    socket.on("disconnect", () => {
      removeSocket(authenticatedUserId, socket.id);
      broadcastOnlineUsers(io);
    });
  });
};

module.exports = presenceSocket;
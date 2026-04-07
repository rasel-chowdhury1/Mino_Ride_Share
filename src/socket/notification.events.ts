// ─────────────────────────────────────────────────────────────────────────────
// notification.events.ts
// Manages the connected-users registry and notification socket events.
//
// Kept separate from socketIo.ts to avoid circular imports:
//   socketIo.ts → socket.server.ts → notification.events.ts  (no cycle)
// ─────────────────────────────────────────────────────────────────────────────

import { Socket } from 'socket.io';
import { Types } from 'mongoose';
import Notification from '../app/modules/notifications/notifications.model';

// ── Connected users registry ──────────────────────────────────────────────────
// Maps userId → { socketID }
// Populated on connect, cleaned on disconnect.

export const connectedUsers = new Map<string, { socketID: string }>();

// ── Register notification events for a connected socket ───────────────────────

export function registerNotificationEvents(socket: Socket): void {
  const userId = socket.user?._id;
  if (!userId) return;

  // Track this socket in the connected-users map
  connectedUsers.set(userId, { socketID: socket.id });

  // Emit current unread count immediately on connect
  Notification.countDocuments({ receiverId: userId, isRead: false })
    .then((count) => {
      socket.emit('notification', {
        statusCode: 200,
        success: true,
        unreadCount: count >= 0 ? count : 0,
        timestamp: new Date(),
      });
    })
    .catch(() => {});

  // Broadcast updated online users list to everyone
  socket.server.emit('onlineUser', Array.from(connectedUsers.keys()));

  // ── readNotification ──────────────────────────────────────────────────────
  // Client calls this when user opens the notification panel.
  // Marks all unread notifications as read and immediately confirms 0 unread.
  socket.on('readNotification', () => {
    if (!socket.user?._id) return;

    // Fire-and-forget DB update
    Notification.updateMany(
      { receiverId: new Types.ObjectId(socket.user._id), isRead: false },
      { $set: { isRead: true } },
    ).catch((err) => console.error('Error updating notifications:', err));

    // Immediately confirm unread = 0 to the client
    socket.emit('notification', {
      statusCode: 200,
      success: true,
      unreadCount: 0,
      timestamp: new Date(),
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  // Remove user from the connected-users registry and broadcast updated list.
  socket.on('disconnect', () => {
    for (const [key, val] of connectedUsers.entries()) {
      if (val.socketID === socket.id) {
        connectedUsers.delete(key);
        break;
      }
    }

    socket.server.emit('onlineUser', Array.from(connectedUsers.keys()));
  });
}

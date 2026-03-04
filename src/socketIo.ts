// ─────────────────────────────────────────────────────────────────────────────
// socketIo.ts
// Public API for the socket layer.
//
// Exports:
//   io              — the live Socket.IO server instance
//   initSocketIO    — bootstraps the socket server
//   connectedUsers  — userId → { socketID } live registry
//   emitNotification        — send a notification to a specific user
//   sentNotificationFor*    — domain-specific notification helpers
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose';
import { User } from './app/modules/user/user.model';
import AppError from './app/error/AppError';
import Notification from './app/modules/notifications/notifications.model';
import { sendNotificationEmail } from './app/utils/emailNotification';
import { getIO, initSocketServer } from './socket/socket.server';
import { connectedUsers } from './socket/notification.events';

// ── Re-exports ─────────────────────────────────────────────────────────────

export { getIO as io };
export { initSocketServer as initSocketIO };
export { connectedUsers };

// ── emitNotification ──────────────────────────────────────────────────────────
// Emits a real-time notification to the target user's socket and saves it
// to the database.

export const emitNotification = async ({
  userId,
  receiverId,
  userMsg,
  type,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  userMsg?: { image: string; text: string; photos?: string[] };
  type?: string;
}): Promise<void> => {
  const io = getIO();

  const userSocket = connectedUsers.get(receiverId.toString());

  const unreadCount = await Notification.countDocuments({
    receiverId,
    isRead: false,
  });

  // Emit real-time notification if user is online
  if (userMsg && userSocket) {
    io.to(userSocket.socketID).emit('notification', {
      message: userMsg,
      statusCode: 200,
      success: true,
      unreadCount: unreadCount >= 0 ? unreadCount + 1 : 1,
      timestamp: new Date(),
    });
  }

  // Persist to database
  await Notification.create({
    userId,
    receiverId,
    message: userMsg,
    type,
    isRead: false,
    timestamp: new Date(),
  });
};

// ── sentNotificationForRideRequest ────────────────────────────────────────────
// Notify a driver about a new ride request.

export const sentNotificationForRideRequest = async ({
  userId,
  receiverId,
  vehicleCategory,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  vehicleCategory?: string;
}): Promise<void> => {
  const sender = await User.findById(userId).select('name profileImage');
  if (!sender) throw new AppError(404, 'User not found for notification');

  const receiver = await User.findById(receiverId).select('name email');
  if (!receiver) throw new AppError(404, 'Receiver not found for notification');

  const text = `${sender.name} has requested a ${vehicleCategory || 'ride'}.`;

  emitNotification({
    userId,
    receiverId,
    userMsg: { image: sender.profileImage || '', text, photos: [] },
    type: 'newRideRequest',
  }).catch((err) => console.error('Socket notification failed:', err));

  if (receiver.email) {
    sendNotificationEmail({
      sentTo: receiver.email,
      subject: 'New Ride Request',
      userName: receiver.name || '',
      messageText: text,
    }).catch((err) => console.error('Email notification failed:', err));
  }
};

// ── sentNotificationForRideCancelled ─────────────────────────────────────────
// Notify the other party when a ride is cancelled.

export const sentNotificationForRideCancelled = async ({
  userId,
  receiverId,
  reason,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  reason?: string;
}): Promise<void> => {
  const sender = await User.findById(userId).select('name profileImage');
  const receiver = await User.findById(receiverId).select('name email');

  if (!sender || !receiver) return;

  const text = reason
    ? `${sender.name} has cancelled the ride. Reason: ${reason}`
    : `${sender.name} has cancelled the ride.`;

  emitNotification({
    userId,
    receiverId,
    userMsg: { image: sender.profileImage || '', text, photos: [] },
    type: 'tripCancelled',
  }).catch((err) => console.error('Socket notification failed:', err));

  if (receiver.email) {
    sendNotificationEmail({
      sentTo: receiver.email,
      subject: 'Ride Cancelled',
      userName: receiver.name || '',
      messageText: text,
    }).catch((err) => console.error('Email notification failed:', err));
  }
};

// ── sentNotificationForPaymentConfirmed ──────────────────────────────────────
// Notify user when a payment is confirmed.

export const sentNotificationForPaymentConfirmed = async ({
  userId,
  receiverId,
  amount,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  amount?: number;
}): Promise<void> => {
  const sender = await User.findById(userId).select('name profileImage');
  const receiver = await User.findById(receiverId).select('name email');

  if (!sender || !receiver) return;

  const text = amount
    ? `Payment of ${amount} confirmed for your ride.`
    : `Your ride payment has been confirmed.`;

  emitNotification({
    userId,
    receiverId,
    userMsg: { image: sender.profileImage || '', text, photos: [] },
    type: 'paymentConfirmed',
  }).catch((err) => console.error('Socket notification failed:', err));

  if (receiver.email) {
    sendNotificationEmail({
      sentTo: receiver.email,
      subject: 'Payment Confirmed',
      userName: receiver.name || '',
      messageText: text,
    }).catch((err) => console.error('Email notification failed:', err));
  }
};

// ── sentNotificationForRideCompleted ─────────────────────────────────────────
// Notify passenger when ride is marked completed.

export const sentNotificationForRideCompleted = async ({
  userId,
  receiverId,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
}): Promise<void> => {
  const sender = await User.findById(userId).select('name profileImage');
  const receiver = await User.findById(receiverId).select('name email');

  if (!sender || !receiver) return;

  const text = `Your ride with ${sender.name} has been completed. Thank you for riding!`;

  emitNotification({
    userId,
    receiverId,
    userMsg: { image: sender.profileImage || '', text, photos: [] },
    type: 'rideCompleted',
  }).catch((err) => console.error('Socket notification failed:', err));

  if (receiver.email) {
    sendNotificationEmail({
      sentTo: receiver.email,
      subject: 'Ride Completed',
      userName: receiver.name || '',
      messageText: text,
    }).catch((err) => console.error('Email notification failed:', err));
  }
};

// ── sentNotificationForDriverVerified ────────────────────────────────────────
// Notify driver when their account is verified by admin.

export const sentNotificationForDriverVerified = async ({
  userId,
  receiverId,
}: {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
}): Promise<void> => {
  const receiver = await User.findById(receiverId).select('name email');
  if (!receiver) return;

  const text = `Congratulations! Your driver account has been verified. You can now start accepting rides.`;

  emitNotification({
    userId,
    receiverId,
    userMsg: { image: '', text, photos: [] },
    type: 'driverVerified',
  }).catch((err) => console.error('Socket notification failed:', err));

  if (receiver.email) {
    sendNotificationEmail({
      sentTo: receiver.email,
      subject: 'Account Verified',
      userName: receiver.name || '',
      messageText: text,
    }).catch((err) => console.error('Email notification failed:', err));
  }
};

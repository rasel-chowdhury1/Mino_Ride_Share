import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { Ride } from '../ride/ride.model';
import { Driver } from '../driver/driver.model';
import { Message } from './message.model';

// ─────────────────────────────────────────────────────────────────────────────

export interface SendMessagePayload {
  rideId:     string;
  senderId:   string;   // always the User._id
  senderRole: 'passenger' | 'driver';
  message:    string;
}

/**
 * Persists a chat message.
 * ride.driver = Driver profile ID, senderId = User ID — handled via Driver lookup.
 * receiverId is always stored as User._id for consistent mark-as-read queries.
 */
const sendMessage = async (payload: SendMessagePayload) => {
  const ride = await Ride.findById(payload.rideId).select('passenger driver status');
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot send messages on a completed or cancelled ride');
  }

  let receiverId: string;

  if (payload.senderRole === 'passenger') {
    if (ride.passenger.toString() !== payload.senderId) {
      throw new AppError(httpStatus.FORBIDDEN, 'You are not the passenger of this ride');
    }
    if (!ride.driver) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No driver assigned to this ride yet');
    }

    // Convert driverProfileId → driver's userId so receiverId is always a User ID
    const driverDoc = await Driver.findById(ride.driver).select('userId').lean();
    if (!driverDoc) throw new AppError(httpStatus.NOT_FOUND, 'Driver not found');
    receiverId = driverDoc.userId.toString();

  } else {
    // Driver is sending: validate via Driver profile lookup (ride.driver = Driver._id)
    if (!ride.driver) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No driver assigned to this ride yet');
    }
    const driverDoc = await Driver.findOne({ userId: payload.senderId }).select('_id').lean();
    if (!driverDoc || driverDoc._id.toString() !== ride.driver.toString()) {
      throw new AppError(httpStatus.FORBIDDEN, 'You are not the driver of this ride');
    }
    receiverId = ride.passenger.toString();
  }

  const saved = await Message.create({
    rideId:     payload.rideId,
    senderId:   payload.senderId,
    receiverId,
    senderRole: payload.senderRole,
    message:    payload.message,
  });

  return saved.populate('senderId', 'name profileImage');
};

// ─────────────────────────────────────────────────────────────────────────────

/** Returns the full chat history for a ride, oldest first. */
const getRideMessages = async (rideId: string, requesterId: string) => {
  const ride = await Ride.findById(rideId).select('passenger driver');
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  // passenger check (userId matches directly)
  const isPassenger = ride.passenger.toString() === requesterId;

  // driver check: ride.driver is Driver profile ID, requesterId is User ID
  let isDriver = false;
  if (!isPassenger && ride.driver) {
    const driverDoc = await Driver.findOne({ userId: requesterId }).select('_id').lean();
    isDriver = !!driverDoc && driverDoc._id.toString() === ride.driver.toString();
  }

  if (!isPassenger && !isDriver) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not a participant of this ride');
  }

  // Mark received messages as read
  await Message.updateMany(
    { rideId, receiverId: requesterId, isRead: false, isDeleted: false },
    { isRead: true },
  );

  return Message.find({ rideId, isDeleted: false })
    .populate('senderId', 'name profileImage')
    .sort({ createdAt: 1 });
};

// ─────────────────────────────────────────────────────────────────────────────

/** Returns unread message count for a user in a ride. */
const getUnreadCount = async (rideId: string, userId: string): Promise<number> => {
  return Message.countDocuments({ rideId, receiverId: userId, isRead: false, isDeleted: false });
};

// ─────────────────────────────────────────────────────────────────────────────

export const MessageService = {
  sendMessage,
  getRideMessages,
  getUnreadCount,
};

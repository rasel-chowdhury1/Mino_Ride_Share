import { Schema, model } from 'mongoose';
import { INotification } from './notifications.interface';

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // the sender of the notification, can be admin or driver
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // the target user (driver or rider)
      required: true,
    },
    // Unified message object
    message: {
      fullName: { type: String, default: "" }, // sender's name
      image: { type: String, default: "" },    // optional sender image
      text: { type: String, required: true }, // notification content
      photos: { type: [String], default: [] }, // optional images
    },
    type: {
      type: String,
      enum: [
        'newRideRequest',       // rider → driver
        'rideAccepted',         // driver → passenger
        'rideStarted',          // system → passenger
        'tripCancelled',        // rider or driver → other party
        'paymentConfirmed',     // system → rider/driver
        'adminApprovalUpdate',  // admin → user
        'promotionAlert',       // system → user
        'bonusAlert',           // system → user
        'driverVerified',       // system/admin → driver
        'rideCompleted',        // system → rider/driver
      ],
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Notification = model<INotification>('Notification', NotificationSchema);
export default Notification;
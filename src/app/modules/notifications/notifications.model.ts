import { Schema, model } from 'mongoose';
import { INotification } from './notifications.interface';

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Unified message object
    message: {
      fullName: { type: String, default: "" },
      image: { type: String, default: "" },
      text: { type: String, required: true },
      photos: { type: [String], default: [] },
    },

    type: {
      type: String,
      enum: [
        'technicianPendingApproval', // user → technician
        'serviceOrderPending',       // user → technician
        'serviceOrderAccepted',      // technician → user
        'technicianVerified',
        'technicianDeclined',
        'serviceOrderCompleted'
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

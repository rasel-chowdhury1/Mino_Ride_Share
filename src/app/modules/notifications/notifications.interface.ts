import { Schema } from "mongoose";

export interface INotification {
  userId: Schema.Types.ObjectId;      // Sender user ID (driver, rider, admin, or system)
  receiverId: Schema.Types.ObjectId;  // Receiver user ID (driver or rider)

  message: {
    fullName?: string;   // Optional sender name
    image?: string;      // Optional sender image
    text: string;        // Notification content
    photos?: string[];   // Optional images related to notification
  };

  type:
  | "newRideRequest"      // rider → driver
  | "tripCancelled"       // rider or driver → other party
  | "paymentConfirmed"    // system → rider/driver
  | "adminApprovalUpdate" // admin → user
  | "promotionAlert"      // system → user
  | "bonusAlert"          // system → user
  | "driverVerified"      // system/admin → driver
  | "rideCompleted";      // system → rider/driver

  isRead: boolean;        // Whether the notification has been read
  createdAt?: Date;       // Auto-populated by mongoose
  updatedAt?: Date;       // Auto-populated by mongoose
}
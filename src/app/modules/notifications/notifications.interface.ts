import { Schema } from "mongoose";

export interface INotification {
  userId: Schema.Types.ObjectId;      // Sender user ID
  receiverId: Schema.Types.ObjectId;  // Receiver user ID

  message: {
    fullName?: string;
    image?: string;
    text: string;
    photos?: string[];
  };

  type:
    | "technicianPendingApproval"
    | "serviceOrderPending"
    | "serviceOrderAccepted"
    | "technicianVerified"
    | "technicianDeclined"
    | "serviceOrderCompleted";

  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

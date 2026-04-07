import { Types } from 'mongoose';

export type TMessageSenderRole = 'passenger' | 'driver';

export interface IMessage {
  rideId:     Types.ObjectId;
  senderId:   Types.ObjectId;
  receiverId: Types.ObjectId;
  senderRole: TMessageSenderRole;
  message:    string;
  isRead:     boolean;
  isDeleted:  boolean;
}

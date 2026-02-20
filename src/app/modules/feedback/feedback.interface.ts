import { Types } from "mongoose";

export interface IFeedback {
  userId: Types.ObjectId;
  rating: number;
  text: string;
  adminVerified: string;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUpdateFeedback {
  text?: string;
}

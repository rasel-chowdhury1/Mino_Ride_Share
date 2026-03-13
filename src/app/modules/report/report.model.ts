import { Schema, model } from 'mongoose';
import { IReport } from './report.interface';

const ReportSchema = new Schema<IReport>(
  {
    rideId: {
      type: Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },

    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    details: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ['pending', 'resolved'],
      default: 'pending',
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const Report = model<IReport>('Report', ReportSchema);

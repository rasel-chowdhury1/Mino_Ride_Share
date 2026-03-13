import { Types } from 'mongoose';

export type TReportStatus = 'pending' | 'resolved';

export interface IReport {
  rideId:       Types.ObjectId;  // ref: Ride
  reportedBy:   Types.ObjectId;  // ref: User — who filed the report
  reportedUser: Types.ObjectId;  // ref: User — who is being reported
  reason:       string;
  details?:     string;
  status:       TReportStatus;
  isDeleted:    boolean;
}

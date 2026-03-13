import { Types } from 'mongoose';

export type TPaymentMethod = 'CASH' | 'WALLET' | 'CARD';
export type TPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface IPayment {
  transactionId?: string;                // auto-generated e.g. #MNP1234
  rideId:        Types.ObjectId;
  passengerId:   Types.ObjectId;
  driverId:      Types.ObjectId;
  amount:        number;                 // totalFare at time of payment
  tip:           number;                 // tip included in amount
  paymentMethod: TPaymentMethod;
  paymentStatus: TPaymentStatus;
  stripePaymentIntentId?: string;
  paidAt?:       Date;
  isDeleted:     boolean;
}

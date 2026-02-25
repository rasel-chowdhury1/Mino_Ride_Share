import { Types } from 'mongoose';
import { TVehicleType } from '../driver/driver.interface';

export type TRideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'ONGOING'
  | 'ARRIVED_DROPOFF'
  | 'COMPLETED'
  | 'CANCELLED';

export type TServiceType = 'RIDE' | 'PARCEL';

export const AVERAGE_SPEED_KMH: Record<TVehicleType, number> = {
  MINO_MOTO: 35,
  MINO_GO: 40,
  MINO_COMFORT: 45,
  MINO_XL: 38,
};

export interface ILocation {
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface ICancellation {
  cancelledBy: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  reason: string;
  details?: string;
  timestamp: Date;
}



export interface IStatusHistory {
  status: TRideStatus;      // the status at this point
  changedAt: Date;         // timestamp when the status changed
}

export interface NearestRidesProps {
  driverLocation: [number, number]; // [longitude, latitude]
  maxDistanceMeters?: number;       // optional radius
  now?: Date;                       // current timestamp
}

export interface IRide {
  country: string;

  passenger: Types.ObjectId;
  driver?: Types.ObjectId;

  serviceType: TServiceType;
  vehicleCategory: 'MINO_GO' | 'MINO_COMFORT' | 'MINO_XL' | 'MINO_MOTO' ;
  pickupLocation: ILocation;
  dropoffLocation: ILocation;

  status: TRideStatus;

  paymentMethod: 'CASH' | 'WALLET' | 'CARD';
  paymentStatus: 'PENDING' | 'PAID';

  distanceKm: Number,
  durationMin: Number,
  estimatedFare: number;
  totalFare?: number;

  driverEarning?: number;
  adminCommission?: number;

  // promo
  promo?: Types.ObjectId;
  promoDiscount?: number;
  // Parcel only
  receiverName?: string;
  receiverPhone?: string;

  scheduledAt?: Date;
  driverAcceptedAt?: Date;
  cancelledBy?: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  reason?: string;
  cancellations?: ICancellation[];
  statusHistory?: IStatusHistory[];
  isDeleted: boolean;
}
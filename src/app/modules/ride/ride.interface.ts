import { Types } from 'mongoose';

export type TRideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'ONGOING'
  | 'ARRIVED_DROPOFF'
  | 'COMPLETED'
  | 'CANCELLED';

export type TServiceType = 'RIDE' | 'PARCEL';

export interface ILocation {
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface IRide {
  country: string;

  passenger: Types.ObjectId;
  driver?: Types.ObjectId;

  serviceType: TServiceType;
  vehicleCategory: 'MINO_GO' | 'MINO_XL' | 'MINO_MOTO';
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

  // Parcel only
  receiverName?: string;
  receiverPhone?: string;

  scheduledAt?: Date;

  cancelledBy?: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  cancellationReason?: string;

  isDeleted: boolean;
}
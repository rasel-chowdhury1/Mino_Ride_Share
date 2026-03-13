import { Types } from 'mongoose';
import { TVehicleType } from '../driver/driver.interface';

export type TRideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVED_PICKUP'
  | 'ONGOING'
  | 'END_RIDE'
  | 'ARRIVED_DROPOFF'
  | 'CONFIRM_DROPOFF'
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

export interface IReviewEntry {
  rating:   number;   // 1–5
  comment?: string;
  givenAt:  Date;
}

export type TItemType = 'DOCUMENT' | 'SMALL_PARCEL' | 'FOOD_ITEM';
export interface IParcelDetails {
  itemType: TItemType;
  approxWeightKg: number;
  isFragile: boolean;
  notes?: string;
  instructions?: string;
  receiverName: string;
  receiverPhone: string;
}

export interface IRide {
  rideId?: string;
  country: string;

  passenger: Types.ObjectId;
  driver?: Types.ObjectId;

  serviceType: TServiceType;
  vehicleCategory: 'MINO_GO' | 'MINO_COMFORT' | 'MINO_XL' | 'MINO_MOTO' ;
  pickupLocation: ILocation;
  dropoffLocation: ILocation;
  actualDropoffLocation?: ILocation;

  status: TRideStatus;

  paymentMethod: 'CASH' | 'WALLET' | 'CARD';
  paymentStatus: 'PENDING' | 'PAID';

  distanceKm: Number,
  durationMin: Number,
  estimatedFare: number;
  totalFare?: number;
  tip?: number;

  driverEarning?: number;
  adminCommission?: number;

  // promo
  promo?: Types.ObjectId;
  promoDiscount?: number;
  
  pickupType: 'INSTANT' | 'SCHEDULED';

  parcelDetails?: IParcelDetails;     

  scheduledAt: Date | null;
  driverAcceptedAt: Date | null;
  cancelledBy?: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  reason?: string;
  cancellations?: ICancellation[];
  statusHistory?: IStatusHistory[];

  // Embedded feedback
  passengerReview?:    IReviewEntry;
  driverReview?:       IReviewEntry;
  isPassengerReviewed: boolean;
  isDriverReviewed:    boolean;

  isDeleted: boolean;
}
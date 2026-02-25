import { Types, Model } from 'mongoose';

export type TDriverType = 'car' | 'motorcycle';
export type TDriverApprovalStatus = 'pending' | 'verified' | 'rejected';
export type TVehicleType = 'MINO_GO' | 'MINO_COMFORT' | 'MINO_XL' | 'MINO_MOTO';

export type TLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export interface IDriver {
  userId: Types.ObjectId; // reference to User
  driverType: TDriverType;
  licenseNumber: string;
  licenseExpiryDate: Date;
  licenseImage: string;
  socialSecurityNumber?: string;

  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleType: TVehicleType;
  vehicleImages: string[]; // multiple images of vehicle
  
  registrationImage: string;
  roadworthinessCertificate?: string;

  country?: string;
  address?: string;
  currentLocation: TLocation;

  approvalStatus: TDriverApprovalStatus;
  isOnline: boolean;
  isOnRide: boolean;
  totalEarnings: number;
  totalTrips: number;
  walletBalance: number;

  averageRating: number;
  totalReviews: number;
}

export interface DriverModel extends Model<IDriver> {
  isDriverApproved(driverId: string): Promise<IDriver | null>;
}

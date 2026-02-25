import { Types, Model } from 'mongoose';

export type TVehicleType = 'car' | 'motorcycle';
export type TDriverApprovalStatus = 'pending' | 'verified' | 'rejected';

export type TLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export interface IDriver {
  userId: Types.ObjectId; // reference to User
  // driverType: TVehicleType;
  licenseNumber: string;
  licenseExpiryDate: Date;
  licenseImage: string;
  socialSecurityNumber?: string;

  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleType: string;
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

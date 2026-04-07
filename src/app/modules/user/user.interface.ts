import { Types, Model } from 'mongoose';

export type TLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export type TAddress = {
  address: string;
  location: TLocation;
};

export type TEmergencyContact = {
  _id?: string;
  name: string;
  countryCode: string;
  phoneNumber: string;
};

export type TUserRole = 'admin' | 'passenger' | 'driver' | 'superadmin';
export type TUserStatus = 'active' | 'blocked' | 'banned';
export type TAdminVerify = 'pending' | 'approved' | 'rejected';
export type TGender = 'male' | 'female' | 'other';

export interface TUserCreate {
  _id?: Types.ObjectId;
  name?: string;
  email: string;
  password: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  role: TUserRole;
  gender?: TGender;
  dateOfBirth: Date;
  profileImage: string;

  country?: string;
  homeAddress?: TAddress;
  workAddress?: TAddress;

  adminVerified: TAdminVerify;
  isPhoneVerified: boolean;

  driverProfileId?: Types.ObjectId;

  rating: number;
  totalReview: number;
  averageRating: number;

  wallet: number;
  isDriverProfileCompleted: boolean;

  status: TUserStatus;
  accessibleRoutes: string[];
  warnings?: {};
  banReason?: string;
  bannedAt?: Date;
  bannedBy?: Types.ObjectId;
  isDeleted: boolean;
  acceptTerms: boolean;
  fcmToken?: string;
  loginWth: 'google' | 'apple' | 'facebook' | 'credentials';
  device: {
    ip: string;
    browser: string;
    os: string;
    device: string;
    lastLogin: string;
  };

  driverType?: string;
  appleId?: string;
  emergencyContacts?: TEmergencyContact[];
}

export interface TUser extends TUserCreate {
  // _id: string;
}

export interface DeleteAccountPayload {
  password: string;
}

export interface UserModel extends Model<TUser> {
  isUserExist(email: string): Promise<TUser>;
  
  isUserActive(email: string): Promise<TUser>;

  IsUserExistById(id: string): Promise<TUser>;

  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>;
}

export type IPaginationOption = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};


export interface PaginateQuery {
  role?: string;
  categoryName?: string;
  page?: number;
  limit?: number;
}

export interface VerifiedProfessionalPayload {
  userId: string;
  status: 'pending' | 'verified';
}

export interface CreateSuperAdminProps {
  name: string;
  email: string;
  phone: string;
  password: string;
}
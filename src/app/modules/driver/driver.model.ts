import { Schema, model } from 'mongoose';
import { IDriver, DriverModel, TVehicleType } from './driver.interface';

/*
|--------------------------------------------------------------------------
| Geo Location Schema
|--------------------------------------------------------------------------
*/

const locationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  { _id: false }
);

/*
|--------------------------------------------------------------------------
| Driver Schema
|--------------------------------------------------------------------------
*/

const driverSchema = new Schema<IDriver, DriverModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    driverType: {
      type: String,
      enum: ['car', 'motorcycle'],
      required: true,
    },

    licenseNumber: { type: String, required: true },
    licenseExpiryDate: { type: Date, required: true },
    licenseImage: { type: String, required: true },
    socialSecurityNumber: { type: String },

    vehicleBrand: { type: String, required: true },
    vehicleModel: { type: String, required: true },
    vehicleColor: { type: String, required: true },
    vehicleType: {
      type: String,
      enum: ["MINO_GO", "MINO_COMFORT", "MINO_XL", "MINO_MOTO"],
      required: true,
    },
    vehicleImages: {
      type: [String],
      default: [],
    },

    
    registrationImage: { type: String, required: true },
    roadworthinessCertificate: { type: String },

    country: {
      type: String,
      required: false,
      uppercase: true,
      index: true,
    },
    address: {
      type: String,
      required: false
    },
    currentLocation: {
      type: locationSchema,
      required: false,
    },

    approvalStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },

    isOnline: {
      type: Boolean,
      default: false,
    },
    isOnRide: {
      type: Boolean,
      default: false
    },
    totalEarnings: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },

    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

driverSchema.index({ currentLocation: '2dsphere' });

/*
|--------------------------------------------------------------------------
| Static Methods
|--------------------------------------------------------------------------
*/

driverSchema.statics.isDriverApproved = async function (driverId: string) {
  return await Driver.findOne({
    _id: driverId,
    approvalStatus: 'approved',
  });
};

/*
|--------------------------------------------------------------------------
| Export Model
|--------------------------------------------------------------------------
*/

export const Driver = model<IDriver, DriverModel>('Driver', driverSchema);

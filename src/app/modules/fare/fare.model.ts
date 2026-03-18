import { Schema, model } from 'mongoose';
import { IFare } from './fare.interface';

const VehicleFareSchema = new Schema(
  {
    ratePerKm: { type: Number, required: true },
    bookingFee: { type: Number, required: true },
    baseFee: { type: Number, required: true },
    minimumFare: { type: Number, required: true },
  },
  { _id: false }
);

const FareSchema = new Schema<IFare>(
  {
    country: {
      type: String,
      required: true,
      unique: true, // ✅ unique country
      uppercase: true,
      trim: true,
    },

    minoGo: { type: VehicleFareSchema, required: true },
    minoXL: { type: VehicleFareSchema, required: true },
    minoMoto: { type: VehicleFareSchema, required: true },

    waitingCharge: {
      enabled: { type: Boolean, default: false },
      gracePeriod: { type: Number, default: 0 },
      rate: { type: Number, default: 0 },
    },

    surcharge: {
      enabled: { type: Boolean, default: false },
      value: { type: Number, default: 0 },
    },

    platformCommissionPercentage: {
      type: Number,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Fare = model<IFare>('Fare', FareSchema);

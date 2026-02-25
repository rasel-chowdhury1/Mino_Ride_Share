import { Schema, model } from 'mongoose';
import { IRide } from './ride.interface';

const LocationSchema = new Schema(
  {
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        index: '2dsphere',
      },
    },
  },
  { _id: false }
);

const RideSchema = new Schema<IRide>(
  {
    country: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },

    passenger: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    driver: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
    },

    serviceType: {
      type: String,
      enum: ['RIDE', 'PARCEL'],
      required: true,
    },
    
    vehicleCategory: {
        type: String,
        required: true
    },
    

    pickupLocation: LocationSchema,
    dropoffLocation: LocationSchema,

    status: {
      type: String,
      enum: [
        'REQUESTED',
        'ACCEPTED',
        'ARRIVED_PICKUP',
        'ONGOING',
        'ARRIVED_DROPOFF',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'REQUESTED',
    },

    paymentMethod: {
      type: String,
      enum: ['CASH', 'WALLET', 'CARD'],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID'],
      default: 'PENDING',
    },

    distanceKm: Number,
    durationMin: Number,

    estimatedFare: Number,
    totalFare: Number,

    driverEarning: Number,
    adminCommission: Number,

    receiverName: String,
    receiverPhone: String,

    scheduledAt: Date,

    cancelledBy: {
      type: String,
      enum: ['PASSENGER', 'DRIVER', 'SYSTEM'],
    },

    cancellationReason: String,

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Ride = model<IRide>('Ride', RideSchema);
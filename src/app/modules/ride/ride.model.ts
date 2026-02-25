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

// Create 2dsphere index for location
LocationSchema.index({ location: '2dsphere' });

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

    distanceKm: {
      type: Number,
      required: true,
      default: 0
    },
    durationMin: {
      type: Number,
      required: true,
      default: 0
    },

    estimatedFare: {
      type: Number,
      required: true,
      default: 0
    },
    totalFare: {
      type: Number,
      required: true,
      default: 0
    },

    driverEarning: {
      type: Number,
      required: true,
      default: 0
    },
    adminCommission: {
      type: Number,
      required: true,
      default: 0
    },

    promo: {
      type: Schema.Types.ObjectId,
      ref: 'Promo',
    },
    promoDiscount: {
      type: Number, // store the discount applied
      default: 0,
    },

    receiverName: {
      type: String,
      default: '',
    },
    receiverPhone: {
      type: String,
      default: '',
    },

    scheduledAt: Date,

    driverAcceptedAt: Date,

    statusHistory: {
      type: [
        {
          status: { type: String, enum: ['REQUESTED','ACCEPTED','ARRIVED_PICKUP','ONGOING','ARRIVED_DROPOFF','COMPLETED','CANCELLED'] },
          changedAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },

    cancelledBy: {
      type: String
    },
    reason: {
      type: String,
    },

    cancellations: [
      {
        cancelledBy: {
          type: String,
          enum: ['PASSENGER', 'DRIVER', 'SYSTEM'],
          required: true,
        },
        reason: { type: String },
        details: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Ride = model<IRide>('Ride', RideSchema);
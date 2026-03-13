import { Schema, model } from 'mongoose';
import { IRide } from './ride.interface';

const ReviewEntrySchema = new Schema(
  {
    rating:  { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    givenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);



/*
|--------------------------------------------------------------------------
| Parcel Details Schema (only used when serviceType === 'PARCEL')
|--------------------------------------------------------------------------
*/

const ParcelDetailsSchema = new Schema(
  {
    itemType: {
      type: String,
      enum: ['DOCUMENT', 'SMALL_PARCEL', 'FOOD_ITEM'],
      required: true,
    },
    approxWeightKg: {
      type: Number,
      required: true,
    },
    isFragile: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: '',
    },
    instructions: {
      type: String,
      default: '',
    },
    receiverName: {
      type: String,
      required: true,
    },
    receiverPhone: {
      type: String,
      required: true,
    },

  },
  { _id: false }
);

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
    rideId: {
      type: String,
      unique: true,
      sparse: true,
    },

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
    actualDropoffLocation: { type: LocationSchema, default: null },

    status: {
      type: String,
      enum: [
        'REQUESTED',
        'ACCEPTED',
        'ARRIVED_PICKUP',
        'ONGOING',
        'END_RIDE',
        'ARRIVED_DROPOFF',
        'CONFIRM_DROPOFF',
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

    tip: {
      type: Number,
      default: 0,
    },

        // INSTANT = send now, SCHEDULED = send at a specific time
    pickupType: {
      type: String,
      enum: ['INSTANT', 'SCHEDULED'],
      required: true,
      default: 'INSTANT',
    },

    // Only required when pickupType === 'SCHEDULED'
    scheduledAt: {
      type: Date,
      default: null,
    },

    parcelDetails: {
      type: ParcelDetailsSchema,
      default: null,
    },

    driverAcceptedAt: {
      type: Date,
      default: null,
    },

    statusHistory: {
      type: [
        {
          status: { type: String, enum: ['REQUESTED','ACCEPTED','ARRIVED_PICKUP','ONGOING','END_RIDE','ARRIVED_DROPOFF','CONFIRM_DROPOFF','COMPLETED','CANCELLED'] },
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
    

    // Embedded feedback — set when each party submits their review
    passengerReview: { type: ReviewEntrySchema, default: null },
    driverReview:    { type: ReviewEntrySchema, default: null },
    isPassengerReviewed: { type: Boolean, default: false },
    isDriverReviewed:    { type: Boolean, default: false },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

RideSchema.pre('save', async function (next) {
  if (this.rideId) return next();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Model = this.constructor as any;
  let unique = false;

  while (!unique) {
    const digits = Math.floor(1000 + Math.random() * 9000); // 4-digit: 1000–9999
    const candidate = `#MN${digits}`;
    const exists = await Model.exists({ rideId: candidate });
    if (!exists) {
      this.rideId = candidate;
      unique = true;
    }
  }

  next();
});

export const Ride = model<IRide>('Ride', RideSchema);
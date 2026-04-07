import { Schema, model } from 'mongoose';
import { IPayment } from './payment.interface';

const PaymentSchema = new Schema<IPayment>(
  {
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },

    rideId: {
      type: Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },

    passengerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    totalFare: {
      type: Number,
      default: 0,
    },

    driverEarning: {
      type: Number,
      default: 0,
    },

    adminCommission: {
      type: Number,
      default: 0,
    },

    promo: {
      type: String,
      default: null,
    },

    promoDiscount: {
      type: Number,
      default: 0,
    },

    tip: {
      type: Number,
      default: 0,
    },

    paymentMethod: {
      type: String,
      enum: ['CASH', 'WALLET', 'CARD'],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },

    stripePaymentIntentId: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Auto-generate transactionId like #MNP1234
PaymentSchema.pre('save', async function (next) {
  if (this.transactionId) return next();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Model = this.constructor as any;
  let unique = false;

  while (!unique) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    const candidate = `#MNP${digits}`;
    const exists = await Model.exists({ transactionId: candidate });
    if (!exists) {
      this.transactionId = candidate;
      unique = true;
    }
  }

  next();
});

export const Payment = model<IPayment>('Payment', PaymentSchema);

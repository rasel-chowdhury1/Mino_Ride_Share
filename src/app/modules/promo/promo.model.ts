import { Schema, model } from 'mongoose';
import { IPromo } from './promo.interface';

const PromoSchema = new Schema<IPromo>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
    },

    discount: {
      type: Number,
      required: true,
      min: 0,
    },

    minimumSpend: {
      type: Number,
      required: true,
      min: 0,
    },

    expirationDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Optional index for faster queries
PromoSchema.index({ status: 1, expirationDate: 1 });

export const Promo = model<IPromo>('Promo', PromoSchema);

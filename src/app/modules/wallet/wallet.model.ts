import { Schema, model } from 'mongoose';
import { IWalletTransaction, IWithdrawalRequest } from './wallet.interface';

/*
|--------------------------------------------------------------------------
| Wallet Transaction
|--------------------------------------------------------------------------
*/

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
    },

    source: {
      type: String,
      enum: ['RIDE_EARNING', 'RIDE_PAYMENT', 'WITHDRAWAL', 'REFUND', 'BONUS', 'TOP_UP', "ADMIN_COMMISSION"],
      required: true,
    },

    amount:        { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter:  { type: Number, required: true },

    rideId:      { type: Schema.Types.ObjectId, ref: 'Ride', default: null },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

/*
|--------------------------------------------------------------------------
| Withdrawal Request
|--------------------------------------------------------------------------
*/

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amount: { type: Number, required: true, min: 1 },

    method: {
      type: String,
      enum: ['BANK_TRANSFER', 'MOBILE_BANKING'],
      required: true,
    },

    accountDetails: {
      accountName:   { type: String, required: true },
      accountNumber: { type: String, required: true },
      bankName:      { type: String, default: null },
      provider:      { type: String, default: null },
    },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
      default: 'PENDING',
    },

    rejectionReason: { type: String, default: null },
    processedBy:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt:     { type: Date, default: null },
  },
  { timestamps: true },
);

export const WalletTransaction  = model<IWalletTransaction>('WalletTransaction', WalletTransactionSchema);
export const WithdrawalRequest  = model<IWithdrawalRequest>('WithdrawalRequest', WithdrawalRequestSchema);

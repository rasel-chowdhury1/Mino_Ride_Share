import { Types } from 'mongoose';

export type TTransactionType   = 'CREDIT' | 'DEBIT';
export type TTransactionSource =
  | 'RIDE_EARNING'      // driver earns from completed CARD ride (platform pays driver)
  | 'ADMIN_COMMISSION'  // admin commission deducted from driver on CASH ride
  | 'RIDE_PAYMENT'      // passenger pays via wallet
  | 'WITHDRAWAL'        // user withdraws to bank/mobile
  | 'REFUND'            // ride cancelled refund
  | 'BONUS'             // admin bonus
  | 'TOP_UP';           // passenger tops up wallet

export type TWithdrawalMethod = 'BANK_TRANSFER' | 'MOBILE_BANKING';
export type TWithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export interface IWalletTransaction {
  userId:        Types.ObjectId;
  type:          TTransactionType;
  source:        TTransactionSource;
  amount:        number;
  balanceBefore: number;
  balanceAfter:  number;
  rideId?:       Types.ObjectId;
  description:   string;
  createdAt?:    Date;
}

export interface IWithdrawalRequest {
  userId:        Types.ObjectId;
  amount:        number;
  method:        TWithdrawalMethod;
  accountDetails: {
    accountName:   string;
    accountNumber: string;
    bankName?:     string;   // for BANK_TRANSFER
    provider?:     string;   // for MOBILE_BANKING e.g. bKash, Nagad
  };
  status:          TWithdrawalStatus;
  rejectionReason?: string;
  processedBy?:    Types.ObjectId;
  processedAt?:    Date;
}

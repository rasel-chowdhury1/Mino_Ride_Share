import httpStatus from 'http-status';
import mongoose from 'mongoose';
import AppError from '../../error/AppError';
import QueryBuilder from '../../builder/QueryBuilder';
import { User } from '../user/user.model';
import { Driver } from '../driver/driver.model';
import { WalletTransaction, WithdrawalRequest } from './wallet.model';
import { TTransactionSource, TTransactionType, TWithdrawalMethod } from './wallet.interface';

/*
|--------------------------------------------------------------------------
| Helper — credit or debit wallet atomically with transaction record
|--------------------------------------------------------------------------
*/

export const recordWalletTransaction = async ({
  userId,
  type,
  source,
  amount,
  description,
  rideId,
}: {
  userId:      string;
  type:        TTransactionType;
  source:      TTransactionSource;
  amount:      number;
  description: string;
  rideId?:     string;
}) => {


  console.log({ userId, type, source, amount, description, rideId });
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);


    if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

    const balanceBefore = user.wallet ?? 0;
    const balanceAfter  = type === 'CREDIT'
      ? balanceBefore + amount
      : balanceBefore - amount;

    if (type === 'DEBIT' && balanceAfter < 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance');
    }

    user.wallet = balanceAfter;


    console.log("user =====>>>>>>  ", user);
    await user.save({ session });

    await WalletTransaction.create(
      [{ userId, type, source, amount, balanceBefore, balanceAfter, description, rideId: rideId ?? null }],
      { session },
    );

    await session.commitTransaction();
    return { balanceBefore, balanceAfter, amount };
  } catch (err) {

    console.log("error =====>>>>>>  ", err);
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| Get wallet overview (balance + recent transactions)
|--------------------------------------------------------------------------
*/

const getMyWallet = async (userId: string, role: string) => {
  const isDriver = role === 'driver';

  const [user, driverDoc, pendingWithdrawal, recentTransactions] = await Promise.all([
    User.findById(userId).select('wallet').lean(),
    isDriver ? Driver.findOne({ userId }).select('walletBalance totalEarnings totalTrips').lean() : null,
    WithdrawalRequest.aggregate([
      { $match: { userId: new (require('mongoose').Types.ObjectId)(userId), status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const pendingAmount = pendingWithdrawal[0]?.total ?? 0;

  // Driver available balance comes from driverWallet; passenger from user.wallet
  const totalBalance     = isDriver ? (driverDoc?.walletBalance ?? 0) : (user.wallet ?? 0);
  const availableBalance = Math.max(0, totalBalance - pendingAmount);

  return {
    totalBalance,
    availableBalance,
    pendingWithdrawal: pendingAmount,
    ...(isDriver && driverDoc && {
      totalEarnings: driverDoc.totalEarnings ?? 0,
      totalTrips:    driverDoc.totalTrips    ?? 0,
    }),
    recentTransactions,
  };
};

/*
|--------------------------------------------------------------------------
| Get transaction history (paginated)
|--------------------------------------------------------------------------
*/

const getTransactionHistory = async (userId: string, query: Record<string, unknown>) => {
  const txQuery = new QueryBuilder(
    WalletTransaction.find({ userId }).sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await txQuery.modelQuery;
  const meta   = await txQuery.countTotal();
  return { meta, result };
};

/*
|--------------------------------------------------------------------------
| Request withdrawal
|--------------------------------------------------------------------------
*/

const requestWithdrawal = async (
  userId: string,
  role: string,
  payload: {
    amount:         number;
    method:         TWithdrawalMethod;
    accountDetails: {
      accountName:   string;
      accountNumber: string;
      bankName?:     string;
      provider?:     string;
    };
  },
) => {
  const { amount, method, accountDetails } = payload;

  // Get available balance
  const user = await User.findById(userId).select('wallet').lean();
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const isDriver = role === 'driver';
  let totalBalance = user.wallet ?? 0;

  if (isDriver) {
    const driver = await Driver.findOne({ userId }).select('walletBalance').lean();
    totalBalance = driver?.walletBalance ?? 0;
  }

  // Deduct already-pending withdrawals to get true available balance
  const pendingAgg = await WithdrawalRequest.aggregate([
    { $match: { userId: new (require('mongoose').Types.ObjectId)(userId), status: 'PENDING' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const pendingAmount    = pendingAgg[0]?.total ?? 0;
  const availableBalance = Math.max(0, totalBalance - pendingAmount);

  if (amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Withdrawal amount must be greater than 0');
  }

  if (amount > availableBalance) {
    throw new AppError(httpStatus.BAD_REQUEST, `Insufficient available balance. Available: ${availableBalance}`);
  }


  const request = await WithdrawalRequest.create({
    userId,
    amount,
    method,
    accountDetails,
    status: 'PENDING',
  });

  return request;
};

/*
|--------------------------------------------------------------------------
| Get my withdrawal requests
|--------------------------------------------------------------------------
*/

const getMyWithdrawals = async (userId: string, query: Record<string, unknown>) => {
  const wQuery = new QueryBuilder(
    WithdrawalRequest.find({ userId }).sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await wQuery.modelQuery;
  const meta   = await wQuery.countTotal();
  return { meta, result };
};

/*
|--------------------------------------------------------------------------
| Admin — get all withdrawal requests
|--------------------------------------------------------------------------
*/

const adminGetAllWithdrawals = async (query: Record<string, unknown>) => {
  const wQuery = new QueryBuilder(
    WithdrawalRequest.find()
      .populate('userId', 'name email profileImage phoneNumber role')
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await wQuery.modelQuery;
  const meta   = await wQuery.countTotal();
  return { meta, result };
};

/*
|--------------------------------------------------------------------------
| Admin — approve withdrawal
|--------------------------------------------------------------------------
*/

const approveWithdrawal = async (withdrawalId: string, adminId: string) => {
  const request = await WithdrawalRequest.findById(withdrawalId).populate<{ userId: any }>('userId');
  if (!request) throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal request not found');

  if (request.status !== 'PENDING') {
    throw new AppError(httpStatus.BAD_REQUEST, `Request is already ${request.status}`);
  }

  const userId = request.userId._id.toString();
  const role   = request.userId.role;

  // Deduct from the correct wallet
  if (role === 'driver') {
    const driver = await Driver.findOne({ userId });
    if (!driver) throw new AppError(httpStatus.NOT_FOUND, 'Driver profile not found');
    if (driver.walletBalance < request.amount) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Driver has insufficient wallet balance');
    }
    driver.walletBalance -= request.amount;
    await driver.save();
  } else {
    await recordWalletTransaction({
      userId,
      type:        'DEBIT',
      source:      'WITHDRAWAL',
      amount:      request.amount,
      description: `Withdrawal via ${request.method}`,
    });
  }

  request.status      = 'APPROVED';
  request.processedBy = new mongoose.Types.ObjectId(adminId) as any;
  request.processedAt = new Date();
  await request.save();

  return request;
};

/*
|--------------------------------------------------------------------------
| Admin — reject withdrawal
|--------------------------------------------------------------------------
*/

const rejectWithdrawal = async (withdrawalId: string, adminId: string, reason: string) => {
  const request = await WithdrawalRequest.findById(withdrawalId);
  if (!request) throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal request not found');

  if (request.status !== 'PENDING') {
    throw new AppError(httpStatus.BAD_REQUEST, `Request is already ${request.status}`);
  }

  request.status          = 'REJECTED';
  request.rejectionReason = reason;
  request.processedBy     = new mongoose.Types.ObjectId(adminId) as any;
  request.processedAt     = new Date();
  await request.save();

  return request;
};

/*
|--------------------------------------------------------------------------
| Admin — mark withdrawal as completed (paid out)
|--------------------------------------------------------------------------
*/

const completeWithdrawal = async (withdrawalId: string, adminId: string) => {
  const request = await WithdrawalRequest.findById(withdrawalId);
  if (!request) throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal request not found');

  if (request.status !== 'APPROVED') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only approved requests can be marked as completed');
  }

  request.status      = 'COMPLETED';
  request.processedBy = new mongoose.Types.ObjectId(adminId) as any;
  request.processedAt = new Date();
  await request.save();

  return request;
};

export const WalletService = {
  getMyWallet,
  getTransactionHistory,
  requestWithdrawal,
  getMyWithdrawals,
  adminGetAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  completeWithdrawal,
};

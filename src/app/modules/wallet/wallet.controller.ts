import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { WalletService } from './wallet.service';
import httpStatus from 'http-status';

const getMyWallet = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;
  const result = await WalletService.getMyWallet(userId, role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Wallet retrieved successfully',
    data: result,
  });
});

const getTransactionHistory = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await WalletService.getTransactionHistory(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Transaction history retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const requestWithdrawal = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;
  const result = await WalletService.requestWithdrawal(userId, role, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Withdrawal request submitted successfully',
    data: result,
  });
});

const getMyWithdrawals = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await WalletService.getMyWithdrawals(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Withdrawal requests retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const adminGetAllWithdrawals = catchAsync(async (req: Request, res: Response) => {
  const result = await WalletService.adminGetAllWithdrawals(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All withdrawal requests retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const approveWithdrawal = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await WalletService.approveWithdrawal(req.params.id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Withdrawal approved successfully',
    data: result,
  });
});

const rejectWithdrawal = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { reason } = req.body;
  const result = await WalletService.rejectWithdrawal(req.params.id, userId, reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Withdrawal rejected',
    data: result,
  });
});

const completeWithdrawal = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await WalletService.completeWithdrawal(req.params.id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Withdrawal marked as completed',
    data: result,
  });
});

export const WalletController = {
  getMyWallet,
  getTransactionHistory,
  requestWithdrawal,
  getMyWithdrawals,
  adminGetAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  completeWithdrawal,
};

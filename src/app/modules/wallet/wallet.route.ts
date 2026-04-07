import { Router } from 'express';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import { WalletController } from './wallet.controller';

export const WalletRoutes = Router();

/** User & Driver */
WalletRoutes
  .get(
    '/',
    auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
    WalletController.getMyWallet,
  )

  .get(
    '/transactions',
    auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
    WalletController.getTransactionHistory,
  )

  .post(
    '/withdraw',
    auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
    WalletController.requestWithdrawal,
  )

  .get(
    '/withdrawals',
    auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
    WalletController.getMyWithdrawals,
  )

/** Admin */
  .get(
    '/admin/withdrawals',
    auth(USER_ROLE.ADMIN),
    WalletController.adminGetAllWithdrawals,
  )

  .patch(
    '/admin/withdrawals/:id/approve',
    auth(USER_ROLE.ADMIN),
    WalletController.approveWithdrawal,
  )

  .patch(
    '/admin/withdrawals/:id/reject',
    auth(USER_ROLE.ADMIN),
    WalletController.rejectWithdrawal,
  )

  .patch(
    '/admin/withdrawals/:id/complete',
    auth(USER_ROLE.ADMIN),
    WalletController.completeWithdrawal,
  );

import { Router } from 'express';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import { PaymentController } from './payment.controller';

const router = Router();

/** Passenger — create Stripe Checkout Session (hosted payment page) */
router.post(
  '/checkout/:rideId',
  auth(USER_ROLE.PASSENGER),
  PaymentController.createCheckoutSession,
)

/** Passenger */
.get(
  '/passenger',
  auth(USER_ROLE.PASSENGER),
  PaymentController.getPassengerPayments,
)

/** Driver */
.get(
  '/driver',
  auth(USER_ROLE.DRIVER),
  PaymentController.getDriverPayments,
)

/** Shared — get payment for a specific ride */
.get(
  '/ride/:rideId',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER, USER_ROLE.ADMIN),
  PaymentController.getPaymentByRide,
)

/** Admin */
.get(
  '/admin',
  auth(USER_ROLE.ADMIN),
  PaymentController.adminGetAllPayments,
);

export const PaymentRoutes = router;

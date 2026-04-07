import httpStatus from 'http-status';
import Stripe from 'stripe';
import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import config from '../../config';
import stripeClient from '../../utils/stripe';
import { logger } from '../../utils/logger';
import { IPayment, TPaymentMethod } from './payment.interface';
import { Payment } from './payment.model';
import { Ride } from '../ride/ride.model';
import { Fare } from '../fare/fare.model';
import { Driver } from '../driver/driver.model';
import {
  isManagerReady,
  emitToRideRoom,
  emitToDriver,
  setDriverOnRide,
} from '../../../socket/socket.manager';
import { SocketEvents } from '../../../socket/socket.types';
import { recordWalletTransaction } from '../wallet/wallet.service';

// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePaymentPayload {
  rideId:          string;
  passengerId:     string;
  driverId:        string;
  amount:          number;
  totalFare?:      number;
  driverEarning?:  number;
  adminCommission?: number;
  promo?:          string;
  promoDiscount?:  number;
  tip?:            number;
  paymentMethod:   TPaymentMethod;
  stripePaymentIntentId?: string;
}

const createPayment = async (payload: CreatePaymentPayload): Promise<IPayment> => {
  const payment = await Payment.create({
    rideId:                payload.rideId,
    passengerId:           payload.passengerId,
    driverId:              payload.driverId,
    amount:                payload.amount,
    totalFare:             payload.totalFare      ?? payload.amount,
    driverEarning:         payload.driverEarning  ?? 0,
    adminCommission:       payload.adminCommission ?? 0,
    promo:                 payload.promo           ?? null,
    promoDiscount:         payload.promoDiscount   ?? 0,
    tip:                   payload.tip             ?? 0,
    paymentMethod:         payload.paymentMethod,
    paymentStatus:         'PAID',
    stripePaymentIntentId: payload.stripePaymentIntentId,
    paidAt:                new Date(),
  });

  return payment;
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for a CARD ride.
 * Returns the hosted checkout URL so the passenger is redirected to Stripe's payment page.
 */
const createCheckoutSession = async (
  rideId: string,
  passengerId: string,
  tip = 0,
): Promise<{
  checkoutUrl:  string;
  sessionId:    string;
  fareBreakdown: {
    estimatedFare:   number;
    promoDiscount:   number;
    subtotal:        number;
    tip:             number;
    totalFare:       number;
    driverEarning:   number;
    adminCommission: number;
  };
  currency: string;
}> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (ride.passenger.toString() !== passengerId) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not the passenger of this ride');
  }

  if (ride.paymentMethod !== 'CARD') {
    throw new AppError(httpStatus.BAD_REQUEST, 'This ride is not set up for CARD payment');
  }

  if (ride.status !== 'CONFIRM_DROPOFF') {
    throw new AppError(httpStatus.BAD_REQUEST, `Payment not allowed in status: ${ride.status}`);
  }

  if (ride.paymentStatus === 'PAID') {
    throw new AppError(httpStatus.CONFLICT, 'Ride already paid');
  }

  // ── Apply tip ─────────────────────────────────────────────────────────────
  const tipAmount    = Math.max(0, Math.round(tip));
  const subtotal     = ride.totalFare ?? 0;
  const newTotalFare = subtotal + tipAmount;

  const fare = await Fare.findOne({ country: ride.country, isActive: true });
  const commissionPct   = fare?.platformCommissionPercentage ?? 0;
  const adminCommission = Math.round((subtotal * commissionPct) / 100);
  const driverEarning   = Math.round(newTotalFare - adminCommission);

  ride.tip             = tipAmount;
  ride.totalFare       = newTotalFare;
  ride.adminCommission = adminCommission;
  ride.driverEarning   = driverEarning;
  await ride.save();

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  const currency = config.stripe.stripe_currency as string;
  const zeroDecimalCurrencies = ['bif', 'clp', 'gnf', 'jpy', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'xaf', 'xof'];
  const stripeAmount = zeroDecimalCurrencies.includes(currency.toLowerCase())
    ? Math.round(newTotalFare)
    : Math.round(newTotalFare * 100);

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: stripeAmount,
          product_data: {
            name: `Mino Ride Share — Ride ${ride.rideId ?? rideId}`,
            description: tipAmount > 0
              ? `Fare: ${subtotal} + Tip: ${tipAmount}`
              : `Fare: ${subtotal}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      rideId,
      passengerId,
      driverId: ride.driver?.toString() ?? '',
      tip:      String(tipAmount),
    },
    success_url: `http://104.236.248.157:3000/payment/success?rideId=${rideId}`,
    cancel_url:  `http://104.236.248.157:3000/payment/cancel?rideId=${rideId}`,
  });

  return {
    checkoutUrl: session.url!,
    sessionId:   session.id,
    fareBreakdown: {
      estimatedFare:   ride.estimatedFare,
      promoDiscount:   ride.promoDiscount ?? 0,
      subtotal,
      tip:             tipAmount,
      totalFare:       newTotalFare,
      driverEarning,
      adminCommission,
    },
    currency,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles verified Stripe webhook events.
 * Called from the raw-body route in app.ts.
 */
const handleStripeWebhook = async (
  rawBody: Buffer,
  signature: string,
): Promise<void> => {
  const webhookSecret = config.stripe.stripe_webhook_secret;
  if (!webhookSecret) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Stripe webhook secret not configured');
  }

  let event: Stripe.Event;

  console.log("event ==:>>>>>>>>>> ");
  try {
    event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw new AppError(httpStatus.BAD_REQUEST, `Webhook signature verification failed: ${(err as Error).message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { rideId, passengerId, driverId } = session.metadata ?? {};
    if (!rideId) return;

    const ride = await Ride.findById(rideId);
    if (!ride || ride.paymentStatus === 'PAID') return;

    ride.paymentStatus = 'PAID';
    ride.status        = 'COMPLETED';
    if (!ride.statusHistory) ride.statusHistory = [];
    ride.statusHistory.push({ status: 'COMPLETED', changedAt: new Date() });
    await ride.save();

    try {
      const existingPayment = await Payment.findOne({ rideId });
      if (!existingPayment) {
        await Payment.create({
          rideId,
          passengerId,
          driverId,
          amount:          ride.totalFare      ?? 0,
          totalFare:       ride.totalFare      ?? 0,
          driverEarning:   ride.driverEarning  ?? 0,
          adminCommission: ride.adminCommission ?? 0,
          promo:           ride.promo           ?? null,
          promoDiscount:   ride.promoDiscount   ?? 0,
          tip:             ride.tip             ?? 0,
          paymentMethod:   'CARD',
          paymentStatus:   'PAID',
          stripePaymentIntentId: session.payment_intent as string,
          paidAt: new Date(),
        });
      } else {
        existingPayment.paymentStatus         = 'PAID';
        existingPayment.totalFare             = ride.totalFare      ?? 0;
        existingPayment.driverEarning         = ride.driverEarning  ?? 0;
        existingPayment.adminCommission       = ride.adminCommission ?? 0;
        existingPayment.promo                 = ride.promo           ?? null;
        existingPayment.promoDiscount         = ride.promoDiscount   ?? 0;
        existingPayment.tip                   = ride.tip             ?? 0;
        existingPayment.stripePaymentIntentId = session.payment_intent as string;
        existingPayment.paidAt                = new Date();
        await existingPayment.save();
      }
    } catch (err) {
      logger.warn('handleStripeWebhook: checkout payment record upsert failed:', err);
    }

    try {
      const earning = ride.driverEarning ?? 0;
      if (driverId) {
        await Driver.findByIdAndUpdate(driverId, {
          $inc: { walletBalance: earning, totalEarnings: earning, totalTrips: 1 },
        });

        // Record wallet transaction for driver
        if (earning > 0) {
          const driverDoc = await Driver.findById(driverId).select('userId').lean();
          if (driverDoc) {
            recordWalletTransaction({
              userId:      driverDoc.userId.toString(),
              type:        'CREDIT',
              source:      'RIDE_EARNING',
              amount:      earning,
              description: `Earnings from ride #${ride.rideId ?? rideId}`,
              rideId,
            }).catch((err) => logger.warn('handleStripeWebhook: driver wallet tx record failed:', err));
          }
        }
      }
    } catch (err) {
      logger.warn('handleStripeWebhook: checkout driver wallet credit failed:', err);
    }

    try {
      if (isManagerReady()) {
        // const payload = {
        //   rideId,
        //   totalFare:       ride.totalFare ?? 0,
        //   tip:             ride.tip ?? 0,
        //   driverEarning:   ride.driverEarning ?? 0,
        //   adminCommission: ride.adminCommission ?? 0,
        //   paymentStatus:   'PAID',
        //   changedAt:       new Date(),
        // };

        const payload = {
        rideId:          ride._id.toString(),
        pickupLocation:  ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        distanceKm:      ride.distanceKm,
        durationMin:     ride.durationMin,
        estimatedFare:   ride.estimatedFare,
        totalFare:       ride.totalFare ?? 0,
        tip:             ride.tip ?? 0,
        driverEarning:   ride.driverEarning ?? 0,
        adminCommission: ride.adminCommission ?? 0,
        promoDiscount:   ride.promoDiscount ?? 0,
        paymentStatus:   'PAID',
        paymentMethod:   ride.paymentMethod,
        changedAt:       new Date(),
        status: 'PAYMENT_COMPLETED',
      };

        emitToRideRoom(rideId, SocketEvents.RIDE_COMPLETED, payload);
        emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, { rideId, status: 'PAYMENT_COMPLETED', changedAt: new Date() });

        if (ride.driver) {
          emitToDriver(ride.driver.toString(), SocketEvents.RIDE_STATUS_UPDATED, payload);
          setDriverOnRide(ride.driver.toString(), false);
        }
      }
    } catch (err) {
      logger.warn('handleStripeWebhook: checkout socket emission failed:', err);
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const { rideId } = intent.metadata;
    if (!rideId) return;

    await Payment.findOneAndUpdate(
      { rideId, stripePaymentIntentId: intent.id },
      { paymentStatus: 'FAILED' },
    );
    logger.warn(`Stripe payment failed for ride ${rideId}: ${intent.last_payment_error?.message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

const getPaymentByRide = async (rideId: string) => {
  const payment = await Payment.findOne({ rideId, isDeleted: false })
    .populate('passengerId', 'name profileImage phoneNumber')
    .populate({ path: 'driverId', select: 'userId vehicleModel vehicleBrand', populate: { path: 'userId', select: 'name profileImage' } })
    .populate('rideId', 'rideId pickupLocation dropoffLocation distanceKm durationMin status');

  if (!payment) throw new AppError(httpStatus.NOT_FOUND, 'Payment not found for this ride');
  return payment;
};

// ─────────────────────────────────────────────────────────────────────────────

const getPassengerPayments = async (
  passengerId: string,
  query: Record<string, unknown>,
) => {
  const paymentQuery = new QueryBuilder(
    Payment.find({ passengerId, isDeleted: false })
      .populate('rideId', 'rideId pickupLocation dropoffLocation distanceKm durationMin status')
      .populate({ path: 'driverId', select: 'userId vehicleModel vehicleBrand', populate: { path: 'userId', select: 'name profileImage' } })
      .sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await paymentQuery.modelQuery;
  const meta   = await paymentQuery.countTotal();
  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

const getDriverPayments = async (
  driverId: string,
  query: Record<string, unknown>,
) => {
  const paymentQuery = new QueryBuilder(
    Payment.find({ driverId, isDeleted: false })
      .populate('rideId', 'rideId pickupLocation dropoffLocation distanceKm durationMin status')
      .populate('passengerId', 'name profileImage phoneNumber')
      .sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await paymentQuery.modelQuery;
  const meta   = await paymentQuery.countTotal();
  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

const adminGetAllPayments = async (query: Record<string, unknown>) => {
  const paymentQuery = new QueryBuilder(
    Payment.find({ isDeleted: false })
      .populate('passengerId', 'name profileImage countryCode phoneNumber')
      .sort({ createdAt: -1 }),
    query,
  )
    .search(['transactionId', 'paymentMethod', 'paymentStatus'])
    .filter()
    .paginate();

  const result = await paymentQuery.modelQuery;
  const meta   = await paymentQuery.countTotal();
  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

export const PaymentService = {
  createPayment,
  createCheckoutSession,
  handleStripeWebhook,
  getPaymentByRide,
  getPassengerPayments,
  getDriverPayments,
  adminGetAllPayments,
};

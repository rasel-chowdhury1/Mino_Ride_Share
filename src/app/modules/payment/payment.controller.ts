import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PaymentService } from './payment.service';

// ─────────────────────────────────────────────────────────────────────────────
// Stripe — Create Checkout Session (passenger gets a hosted payment URL)
// ─────────────────────────────────────────────────────────────────────────────

const createCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { rideId } = req.params;
  const tip = Number(req.body.tip ?? 0);

  const result = await PaymentService.createCheckoutSession(rideId, userId, tip);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Checkout session created successfully',
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe — Webhook (raw body, no auth — registered in app.ts before express.json)
// ─────────────────────────────────────────────────────────────────────────────

export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'] as string;

  try {
    await PaymentService.handleStripeWebhook(req.body as Buffer, signature);
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

const getPaymentByRide = catchAsync(async (req: Request, res: Response) => {
  const { rideId } = req.params;
  const result = await PaymentService.getPaymentByRide(rideId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payment retrieved successfully',
    data: result,
  });
});

const getPassengerPayments = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await PaymentService.getPassengerPayments(userId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Passenger payments retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getDriverPayments = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;
  const result = await PaymentService.getDriverPayments(driverProfileId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver payments retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const adminGetAllPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.adminGetAllPayments(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All payments retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

export const PaymentController = {
  createCheckoutSession,
  getPaymentByRide,
  getPassengerPayments,
  getDriverPayments,
  adminGetAllPayments,
};

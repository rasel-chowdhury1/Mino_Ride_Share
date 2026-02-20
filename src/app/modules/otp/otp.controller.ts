import catchAsync from '../../utils/catchAsync';
import { otpServices } from './otp.service';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import httpStatus from 'http-status';

const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers?.token as string;

  const {purpose} = req.body;

  await otpServices.resendOtpEmail({ token,purpose });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP Resent successfully',
    data: {},
  });
});

export const otpControllers = {
  resendOtp,
};

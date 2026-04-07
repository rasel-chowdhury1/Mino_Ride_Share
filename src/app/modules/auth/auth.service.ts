import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import config from '../../config';
import AppError from '../../error/AppError';
import { createToken, verifyToken } from '../../utils/tokenManage';
import { otpServices } from '../otp/otp.service';
import { generateOptAndExpireTime } from '../otp/otp.utils';
import { TUser } from '../user/user.interface';
import { User } from '../user/user.model';
import { OTPVerifyAndCreateUserProps } from '../user/user.service';
import { TLogin } from './auth.interface';
import { otpSendEmail } from '../../utils/emailNotification';
import { Request } from 'express';
import UAParser from 'ua-parser-js';
import { Login_With, USER_ROLE } from '../user/user.constants';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const buildDeviceInfo = (req: Request) => {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.socket.remoteAddress ||
    '';
  const userAgent = req.headers['user-agent'] || '';
  // @ts-ignore
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  return {
    ip,
    browser: result.browser.name || '',
    os: result.os.name || '',
    device: result.device.model || 'Desktop',
    lastLogin: new Date().toISOString(),
  };
};

const generateAndReturnTokens = (user: TUser) => {
  const jwtPayload = {
    userId:                  (user as any)._id?.toString() ?? '',
    name:                    user.name ?? '',
    profileImage:            user.profileImage ?? '',
    email:                   user.email,
    role:                    user.role,
    driverProfileId:         user.driverProfileId?.toString() ?? '',
    country:                 user.country ?? '',
    adminVerified:           user.adminVerified,
    isDriverProfileCompleted: user.isDriverProfileCompleted,
  };

  const accessToken = createToken({
    payload:       jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time:   config.jwt_access_expires_in as string,
  });

  const refreshToken = createToken({
    payload:       jwtPayload,
    access_secret: config.jwt_refresh_secret as string,
    expity_time:   config.jwt_refresh_expires_in as string,
  });

  const userResponse = {
    ...(user as any).toObject?.() ?? user,
    homeAddress: user.homeAddress ?? {},
    workAddress: user.workAddress ?? {},
  };

  return { user: userResponse, accessToken, refreshToken };
};

// Login
const login = async (payload: TLogin, req: Request) => {
  const user = await User.isUserActive(payload?.email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  if (!(await User.isPasswordMatched(payload.password, user.password))) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password does not match');
  }

  const jwtPayload: {
    userId: string;
    name: string;
    profileImage: string;
    email: string;
    role: string;
    driverProfileId: string;
    country: string;
  } = {
    userId: user?._id?.toString() ?? '',
    name: user.name || '',
    profileImage: user.profileImage || '',
    email: user.email,
    role: user?.role,
    driverProfileId: user?.driverProfileId?.toString() ?? '',
    country: user?.country ?? '',
  };

  if (user) {
    const updateData: Record<string, unknown> = { device: buildDeviceInfo(req) };
    if (payload.fcmToken) updateData.fcmToken = payload.fcmToken;

    await User.findByIdAndUpdate(user._id, updateData, { new: true });
  }

  const accessToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.jwt_access_expires_in as string,
  });

  const refreshToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_refresh_secret as string,
    expity_time: config.jwt_refresh_expires_in as string,
  });

  // ✅ Normalize missing address fields to empty objects
  const userResponse = {
    ...user.toObject(),
    homeAddress: user.homeAddress ?? {},
    workAddress: user.workAddress ?? {},
  };

  return {
    user: userResponse,
    accessToken,
    refreshToken,
  };
};


const googleLogin = async (
  payload: { email: string; name?: string; profileImage?: string; role?: string; fcmToken?: string },
  req: Request,
) => {
  
  let user = await User.isUserExist(payload.email);

  if (user) {
    // Existing user checks
    if (user.loginWth !== Login_With.google)
      throw new AppError(httpStatus.FORBIDDEN, `This account is registered with ${user.loginWth}. Please use that login method.`);
    if (user.isDeleted)
      throw new AppError(httpStatus.FORBIDDEN, 'This account has been deleted');
    if (user.status === 'blocked' || user.status === 'banned')
      throw new AppError(httpStatus.FORBIDDEN, 'Your account has been suspended. Please contact support.');

    const updateData: Record<string, unknown> = { device: buildDeviceInfo(req) };
    if (payload.fcmToken) updateData.fcmToken = payload.fcmToken;

    await User.findByIdAndUpdate(user._id, updateData, { new: true });
    return generateAndReturnTokens(user);
  }

  // New user — create account
  const role = (payload.role === USER_ROLE.DRIVER ? USER_ROLE.DRIVER : USER_ROLE.PASSENGER);

  user = await User.create({
    name:         payload.name        || '',
    email:        payload.email,
    password:     `google_${Date.now()}`,
    profileImage: payload.profileImage || '',
    role,
    loginWth:     Login_With.google,
    adminVerified: role === USER_ROLE.DRIVER ? 'pending' : 'verified',
    fcmToken:     payload.fcmToken || '',
    device:       buildDeviceInfo(req),
  });

  return generateAndReturnTokens(user);
};


const appleLogin = async (
  payload: { appleId: string; email?: string; name?: string; role?: string; fcmToken?: string },
  req: Request,
) => {
  // 1️⃣ Find by appleId first (primary), then by email (first login only)
  let user = await User.findOne({ appleId: payload.appleId });
  if (!user && payload.email) {
    user = await User.findOne({ email: payload.email });
  }

  if (user) {
    // Existing user checks
    if (user.loginWth !== Login_With.apple)
      throw new AppError(httpStatus.FORBIDDEN, `This account is registered with ${user.loginWth}. Please use that login method.`);
    if (user.isDeleted)
      throw new AppError(httpStatus.FORBIDDEN, 'This account has been deleted');
    if (user.status === 'blocked' || user.status === 'banned')
      throw new AppError(httpStatus.FORBIDDEN, 'Your account has been suspended. Please contact support.');

    // Attach appleId if missing (first email-matched login)
    const updateData: Record<string, unknown> = { device: buildDeviceInfo(req) };
    if (!user.appleId) updateData.appleId = payload.appleId;
    if (payload.fcmToken) updateData.fcmToken = payload.fcmToken;

    await User.findByIdAndUpdate(user._id, updateData, { new: true });
    return generateAndReturnTokens(user);
  }

  // New user — email is optional for Apple Sign In
  if (!payload.email) {
    // Apple hides email after first sign-in; generate a placeholder
    // The appleId is the permanent identifier
    payload.email = `apple_${payload.appleId}@privaterelay.appleid.com`;
  }

  const role = (payload.role === USER_ROLE.DRIVER ? USER_ROLE.DRIVER : USER_ROLE.PASSENGER);

  user = await User.create({
    appleId:      payload.appleId,
    name:         payload.name  || '',
    email:        payload.email,
    password:     `apple_${Date.now()}`,
    profileImage: '',
    role,
    loginWth:     Login_With.apple,
    adminVerified: role === USER_ROLE.DRIVER ? 'pending' : 'verified',
    fcmToken:     payload.fcmToken || '',
    device:       buildDeviceInfo(req),
  });

  return generateAndReturnTokens(user);
};




// forgot Password by email
const forgotPasswordByEmail = async (email: string) => {
  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const { isExist, isExpireOtp } = await otpServices.checkOtpByEmail(
    email,
    'forget-password',
  );

  const { otp, expiredAt } = generateOptAndExpireTime();

  if (isExist && !isExpireOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'otp-exist. Check your email.');
  } else if (isExist && isExpireOtp) {
    const otpUpdateData = {
      otp,
      expiredAt,
      status: 'pending',
    };

    await otpServices.updateOtpByEmail(email, 'forget-password', otpUpdateData);
  } else {
    await otpServices.createOtp({
      name: 'Customer',
      sentTo: email,
      receiverType: 'email',
      purpose: 'forget-password',
      otp,
      expiredAt,
    });
  }

  const jwtPayload = {
    email: email,
    userId: user?._id,
  };

  const forgetToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.otp_token_expire_time as string | number,
  });

  process.nextTick(async () => {
    await otpSendEmail({
      sentTo: email,
      subject: 'Your one time otp for forget password',
      name: user.name || '',
      otp,
      expiredAt: expiredAt,
    });
  });

  return { forgetToken };
};

// forgot  Password Otp Match
const forgotPasswordOtpMatch = async ({
  otp,
  token,
}: OTPVerifyAndCreateUserProps) => {
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token not found');
  }

  const decodeData = verifyToken({
    token,
    access_secret: config.jwt_access_secret as string,
  });

  if (!decodeData) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You are not authorised');
  }

  const { email } = decodeData;

  const isOtpMatch = await otpServices.otpMatch(email, 'forget-password', otp);

  if (!isOtpMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match');
  }

  process.nextTick(async () => {
    await otpServices.updateOtpByEmail(email, 'forget-password', {
      status: 'verified',
    });
  });

  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const jwtPayload = {
    email: email,
    userId: user?._id,
  };

  const forgetOtpMatchToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.otp_token_expire_time as string | number,
  });

  return { forgetOtpMatchToken };
};

// Reset password
const resetPassword = async ({
  token,
  newPassword,
  confirmPassword,
}: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) => {
  if (newPassword !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password does not match');
  }

  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token not found');
  }

  const decodeData = verifyToken({
    token,
    access_secret: config.jwt_access_secret as string,
  });

  if (!decodeData) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You are not authorised');
  }

  const { email, userId } = decodeData;

  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true },
  );

  return result;
};

// Change password
const changePassword = async ({
  userId,
  newPassword,
  oldPassword,
}: {
  userId: string;
  newPassword: string;
  oldPassword: string;
}) => {
  const user = await User.IsUserExistById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!(await User.isPasswordMatched(oldPassword, user.password))) {
    throw new AppError(httpStatus.FORBIDDEN, 'Old password does not match');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true },
  );

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User updating failed');
  }

  return result;
};

// rest ..............................

// Forgot password

// Refresh token
const refreshToken = async (token: string) => {
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token not found');
  }

  const decoded = verifyToken({
    token,
    access_secret: config.jwt_refresh_secret as string,
  });

  const { email } = decoded;

  const activeUser = await User.isUserActive(email);

  if (!activeUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const jwtPayload: {
    userId: string;
    name: string;
    profileImage: string;
    email: string;
    role: string;
  } = {
    userId: activeUser?._id?.toString() as string,
    name: activeUser?.name || '',
    profileImage: activeUser.profileImage || '',
    email: activeUser.email,
    role: activeUser?.role,
  };

  const accessToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.jwt_access_expires_in as string,
  });

  return {
    accessToken,
  };
};

export const authServices = {
  login,
  googleLogin,
  appleLogin,
  forgotPasswordOtpMatch,
  changePassword,
  forgotPasswordByEmail,
  resetPassword,
  refreshToken,
};

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


// Login
const login = async (payload: TLogin) => {
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
    role: string;
    email: string;
  } = {
    userId: user?._id?.toString() as string,
    name: user.name || "",
    profileImage: user.profileImage || "",
    email: user.email,
    role: user?.role,
  };


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

  return {
    user,
    accessToken,
    refreshToken,
  };
};

// forgot Password by email
const forgotPasswordByEmail = async (email: string) => {
  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const { isExist, isExpireOtp } = await otpServices.checkOtpByEmail(email, "forget-password" );

  const { otp, expiredAt } = generateOptAndExpireTime();

  if (isExist && !isExpireOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'otp-exist. Check your email.');
  } else if (isExist && isExpireOtp) {
    const otpUpdateData = {
      otp,
      expiredAt,
      status: 'pending',
    };

    await otpServices.updateOtpByEmail(email,"forget-password", otpUpdateData);
  }
  else{
    await otpServices.createOtp({
      name: "Customer",
      sentTo: email,
      receiverType: 'email',
      purpose: "forget-password",
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

  const isOtpMatch = await otpServices.otpMatch(email,"forget-password", otp);

  if (!isOtpMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match');
  }

  process.nextTick(async () => {
    await otpServices.updateOtpByEmail(email,"forget-password", {
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
    email: string
    role: string;
  } = {
    userId: activeUser?._id?.toString() as string,
    name: activeUser?.name || "",
    profileImage: activeUser.profileImage || "",
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
  forgotPasswordOtpMatch,
  changePassword,
  forgotPasswordByEmail,
  resetPassword,
  refreshToken,
};

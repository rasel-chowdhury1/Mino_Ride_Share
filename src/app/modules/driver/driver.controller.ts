import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { DriverService } from "./driver.service";

const toggleOnlineStatus = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;
  const { isOnline, lat, lng } = req.body;

  if (typeof isOnline !== 'boolean') {
    throw new Error('isOnline must be a boolean');
  }

  const result = await DriverService.toggleOnlineStatus(
    driverProfileId,
    isOnline,
    lat,
    lng
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Driver is now ${isOnline ? 'online' : 'offline'}`,
    data: result,
  });
});

export const DriverController = { toggleOnlineStatus };
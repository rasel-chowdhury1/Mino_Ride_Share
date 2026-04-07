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

// GET /driver/earnings?from=2025-01-01&to=2025-01-07
// GET /driver/earnings?from=2026-03-24&to=2026-03-30
const getEarnings = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;
  const { from, to } = req.query as Record<string, string | undefined>;

  if (!from || !to) {
    throw new Error('from and to query params are required (e.g. ?from=2026-03-24&to=2026-03-30)');
  }

  const result = await DriverService.getEarnings(driverProfileId, { from, to });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Earnings retrieved successfully',
    data: result,
  });
});

// GET /driver/stats
const getDriverStats = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;

  const result = await DriverService.getDriverStats(driverProfileId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver stats retrieved successfully',
    data: result,
  });
});

export const DriverController = { toggleOnlineStatus, getEarnings, getDriverStats };

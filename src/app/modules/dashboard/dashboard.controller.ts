import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { DashboardService } from './dashboard.service';

const getTotalStatistics = catchAsync(async (_req: Request, res: Response) => {
  const result = await DashboardService.getTotalStatistics();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Dashboard statistics retrieved successfully',
    data: result,
  });
});

const getMonthlyUserOverview = catchAsync(async (req: Request, res: Response) => {
  const role = (req.query.role as 'passenger' | 'driver') ?? 'passenger';
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await DashboardService.getMonthlyUserOverview(role, year);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Monthly user overview retrieved successfully',
    data: result,
  });
});

const getEarningOverviewByYear = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await DashboardService.getEarningOverviewByYear(year);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Earning overview retrieved successfully',
    data: result,
  });
});

export const DashboardController = {
  getTotalStatistics,
  getMonthlyUserOverview,
  getEarningOverviewByYear,
};

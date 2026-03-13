import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ReportService } from './report.service';

const createReport = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { rideId, reportedUser, reason, details } = req.body;

  const result = await ReportService.createReport(userId, {
    rideId,
    reportedUser,
    reason,
    details,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Report submitted successfully',
    data: result,
  });
});

const getMyReports = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await ReportService.getMyReports(userId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Your reports retrieved',
    meta: result.meta,
    data: result.result,
  });
});

const getAllReports = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getAllReports(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All reports retrieved',
    meta: result.meta,
    data: result.result,
  });
});

const updateReportStatus = catchAsync(async (req: Request, res: Response) => {
  const { reportId } = req.params;
  const { status } = req.body;

  const result = await ReportService.updateReportStatus(reportId, status);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Report status updated',
    data: result,
  });
});

export const ReportController = {
  createReport,
  getMyReports,
  getAllReports,
  updateReportStatus,
};

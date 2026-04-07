import httpStatus from 'http-status';
import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { IReport } from './report.interface';
import { Report } from './report.model';

// ─────────────────────────────────────────────────────────────────────────────

const createReport = async (
  reportedBy: string,
  payload: Pick<IReport, 'rideId' | 'reportedUser' | 'reason' | 'details'>,
) => {
  return Report.create({ ...payload, reportedBy });
};

// ─────────────────────────────────────────────────────────────────────────────

const getMyReports = async (userId: string, query: Record<string, unknown>) => {
  const rideQuery = new QueryBuilder(
    Report.find({ reportedBy: userId, isDeleted: false })
      .populate('rideId', 'rideId status pickupLocation dropoffLocation')
      .populate('reportedUser', 'name profileImage')
      .sort({ createdAt: -1 }),
    query,
  )
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta   = await rideQuery.countTotal();
  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

const getAllReports = async (query: Record<string, unknown>) => {
  const rideQuery = new QueryBuilder(
    Report.find({ isDeleted: false })
      .populate('rideId', 'rideId status')
      .populate('reportedBy', 'name profileImage role')
      .populate('reportedUser', 'name profileImage role')
      .sort({ createdAt: -1 }),
    query,
  )
    .search(['reason', 'status'])
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta   = await rideQuery.countTotal();
  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

const updateReportStatus = async (
  reportId: string,
  status: IReport['status'],
) => {
  const report = await Report.findByIdAndUpdate(
    reportId,
    { status },
    { new: true },
  );
  if (!report) throw new AppError(httpStatus.NOT_FOUND, 'Report not found');
  return report;
};

// ─────────────────────────────────────────────────────────────────────────────

export const ReportService = {
  createReport,
  getMyReports,
  getAllReports,
  updateReportStatus,
};

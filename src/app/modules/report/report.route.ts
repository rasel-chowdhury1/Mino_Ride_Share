import { Router } from 'express';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import { ReportController } from './report.controller';

const router = Router();

// Passenger or driver submits a report
router.post(
  '/create',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  ReportController.createReport,
);

// Get own submitted reports
router.get(
  '/my',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  ReportController.getMyReports,
);

// Admin: get all reports
router.get(
  '/',
  auth(USER_ROLE.ADMIN),
  ReportController.getAllReports,
);

// Admin: update report status (pending → resolved)
router.patch(
  '/status/:reportId',
  auth(USER_ROLE.ADMIN),
  ReportController.updateReportStatus,
);

export const ReportRoutes = router;

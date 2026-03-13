import { Router } from 'express';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import { DashboardController } from './dashboard.controller';

const router = Router();

router
  /** GET /api/v1/dashboard/statistics */
  .get(
    '/statistics',
    auth(USER_ROLE.ADMIN),
    DashboardController.getTotalStatistics,
  )

  /** GET /api/v1/dashboard/users/monthly?year=2026 */
  .get(
    '/users/monthly',
    auth(USER_ROLE.ADMIN),
    DashboardController.getMonthlyUserOverview,
  )

  /** GET /api/v1/dashboard/earnings/yearly?year=2026 */
  .get(
    '/earnings/yearly',
    auth(USER_ROLE.ADMIN),
    DashboardController.getEarningOverviewByYear,
  );

export const DashboardRoutes = router;

import { User } from '../user/user.model';
import { Ride } from '../ride/ride.model';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Total statistics card + recent users list.
 * Returns: totalUsers, totalPassengers, totalDrivers, totalEarnings, recentUsers.
 */
const getTotalStatistics = async () => {
  const [
    totalUsers,
    totalPassengers,
    totalDrivers,
    earningAgg,
    recentUsers,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    User.countDocuments({ role: 'passenger', isDeleted: false }),
    User.countDocuments({ role: 'driver', isDeleted: false }),
    Ride.aggregate([
      { $match: { status: 'COMPLETED', isDeleted: false } },
      {
        $group: {
          _id:           null,
          totalEarnings: { $sum: '$adminCommission' },
        },
      },
    ]),
    User.find({ isDeleted: false })
      .select('name email role status profileImage createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    totalUsers,
    totalPassengers,
    totalDrivers,
    totalEarnings: earningAgg[0]?.totalEarnings ?? 0,
    recentUsers,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monthly user registration overview.
 * - role: 'passenger' | 'driver' (required) — filters by that role
 * - year: defaults to current year
 * Returns 12 months × { month, count }.
 */
const getMonthlyUserOverview = async (role: 'passenger' | 'driver', year?: number) => {
  const targetYear = year ?? new Date().getFullYear();

  const result = await User.aggregate([
    {
      $match: {
        isDeleted: false,
        role,
        createdAt: {
          $gte: new Date(`${targetYear}-01-01`),
          $lt:  new Date(`${targetYear + 1}-01-01`),
        },
      },
    },
    {
      $group: {
        _id:   { month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: 0,
  }));

  for (const item of result) {
    months[item._id.month - 1].count = item.count;
  }

  return { year: targetYear, role, months };
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monthly earning overview for a given year.
 * Returns 12 months × { month, totalRevenue, adminCommission, driverEarning, totalTips }.
 */
const getEarningOverviewByYear = async (year?: number) => {
  const targetYear = year ?? new Date().getFullYear();

  const result = await Ride.aggregate([
    {
      $match: {
        status:    'COMPLETED',
        isDeleted: false,
        createdAt: {
          $gte: new Date(`${targetYear}-01-01`),
          $lt:  new Date(`${targetYear + 1}-01-01`),
        },
      },
    },
    {
      $group: {
        _id:             { month: { $month: '$createdAt' } },
        totalRevenue:    { $sum: '$totalFare' },
        adminCommission: { $sum: '$adminCommission' },
        driverEarning:   { $sum: '$driverEarning' },
        totalTips:       { $sum: { $ifNull: ['$tip', 0] } },
        totalRides:      { $sum: 1 },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    month:           i + 1,
    totalRevenue:    0,
    adminCommission: 0,
    driverEarning:   0,
    totalTips:       0,
    totalRides:      0,
  }));

  for (const item of result) {
    const idx = item._id.month - 1;
    months[idx].totalRevenue    = Math.round(item.totalRevenue    ?? 0);
    months[idx].adminCommission = Math.round(item.adminCommission ?? 0);
    months[idx].driverEarning   = Math.round(item.driverEarning   ?? 0);
    months[idx].totalTips       = Math.round(item.totalTips       ?? 0);
    months[idx].totalRides      = item.totalRides ?? 0;
  }

  return { year: targetYear, months };
};

// ─────────────────────────────────────────────────────────────────────────────

export const DashboardService = {
  getTotalStatistics,
  getMonthlyUserOverview,
  getEarningOverviewByYear,
};

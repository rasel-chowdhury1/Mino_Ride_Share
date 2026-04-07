import { Types } from "mongoose";
import { Driver } from "./driver.model";
import { Ride } from "../ride/ride.model";

const toggleOnlineStatus = async (
  driverProfileId: string,
  isOnline: boolean,
  lat?: number,
  lng?: number
) => {
  const driver = await Driver.findById(driverProfileId);
  if (!driver) throw new Error('Driver profile not found');

  if (driver.approvalStatus !== 'verified') {
    throw new Error('Only verified drivers can go online');
  }

  if (isOnline && (!lat || !lng || isNaN(lat) || isNaN(lng))) {
    throw new Error('lat and lng are required when going online');
  }

  const updatePayload: Record<string, unknown> = { isOnline };

  if (isOnline) {
    updatePayload.currentLocation = {
      type: 'Point',
      coordinates: [lng, lat],
    };
  }

  const updatedDriver = await Driver.findByIdAndUpdate(
    driverProfileId,
    updatePayload,
    { new: true }
  ).select('isOnline currentLocation vehicleType approvalStatus');

  return updatedDriver;
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1 — Weekly earnings (date-range query or weekOffset navigation)
// ─────────────────────────────────────────────────────────────────────────────

const getEarnings = async (
  driverProfileId: string,
  options: { from: string; to: string },
) => {
  const driver = await Driver.findById(driverProfileId).lean();
  if (!driver) throw new Error('Driver profile not found');

  const from = new Date(options.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(options.to);
  to.setHours(23, 59, 59, 999);

  // ── Rides in range ────────────────────────────────────────────────────────
  const driverObjId = new Types.ObjectId(driverProfileId);

  const rides = await Ride.find({
    driver:    driverObjId,
    status:    'COMPLETED',
    createdAt: { $gte: from, $lte: to },
  })
    .select('pickupLocation dropoffLocation driverEarning durationMin createdAt')
    .sort({ createdAt: -1 })
    .lean() as Array<any>;

  const totalEarned         = rides.reduce((s, r) => s + (r.driverEarning ?? 0), 0);
  const totalCompletedTrips = rides.length;

  // ── Daily breakdown ───────────────────────────────────────────────────────
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const breakdownMap: Record<string, number> = {};

  rides.forEach((r) => {
    const d     = new Date(r.createdAt);
    const label = DAY_LABELS[(d.getDay() + 6) % 7];
    breakdownMap[label] = (breakdownMap[label] ?? 0) + (r.driverEarning ?? 0);
  });

  const breakdown = DAY_LABELS.map((label) => ({
    label,
    amount: breakdownMap[label] ?? 0,
  }));

  // ── Range label e.g. "Jan 12 - Jan 18" ───────────────────────────────────
  const fmt       = (d: Date) => d.toLocaleString('en', { month: 'short', day: 'numeric' });
  const rangeLabel = `${fmt(from)} - ${fmt(to)}`;

  return {
    rangeLabel,
    from: from.toISOString(),
    to:   to.toISOString(),
    totalEarned,
    totalCompletedTrips,
    breakdown,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2 — All-time driver stats + recent completed trips
// ─────────────────────────────────────────────────────────────────────────────

const getDriverStats = async (driverProfileId: string) => {
  const driver = await Driver.findById(driverProfileId).lean();

  console.log("driver ==  >>> >> ", driver);
  if (!driver) throw new Error('Driver profile not found');

  // ── Aggregate tip earnings + active time from completed rides ─────────────
  const [agg] = await Ride.aggregate([
    { $match: { driver: driver._id, status: 'COMPLETED' } },
    {
      $group: {
        _id:                null,
        totalEarningFromTip: { $sum: { $ifNull: ['$tip', 0] } },
        activeTimeMinutes:   { $sum: { $ifNull: ['$durationMin', 0] } },
      },
    },
  ]);

  const totalEarningFromTip = agg?.totalEarningFromTip ?? 0;
  const activeTimeMinutes   = agg?.activeTimeMinutes   ?? 0;

  // Convert minutes → human-readable active time
  const activeHours   = Math.floor(activeTimeMinutes / 60);
  const activeMinutes = activeTimeMinutes % 60;
  const activeTime    = activeHours > 0
    ? `${activeHours}h ${activeMinutes}m`
    : `${activeMinutes}m`;

  // ── Recent 10 completed trips ─────────────────────────────────────────────
  const recentTrips = await Ride.find({ driver: driverProfileId, status: 'COMPLETED' })
    .select('pickupLocation dropoffLocation driverEarning tip durationMin createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean() as Array<any>;

  const recentCompletedTrips = recentTrips.map((r) => ({
    pickup:      r.pickupLocation?.address  ?? '',
    dropoff:     r.dropoffLocation?.address ?? '',
    date:        r.createdAt,
    amount:      r.driverEarning ?? 0,
    tip:         r.tip           ?? 0,
    durationMin: r.durationMin   ?? 0,
  }));

  return {
    totalTrips:         driver.totalTrips     ?? 0,
    totalEarning:       driver.totalEarnings  ?? 0,
    walletBalance:      driver.walletBalance  ?? 0,
    averageRating:      driver.averageRating  ?? 0,
    totalEarningFromTip,
    activeTime,
    activeTimeMinutes,
    recentCompletedTrips,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

export const DriverService = {
  toggleOnlineStatus,
  getEarnings,
  getDriverStats,
};

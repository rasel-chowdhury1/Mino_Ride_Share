import { Types } from 'mongoose';
import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { TVehicleType } from '../driver/driver.interface';
import { Fare } from '../fare/fare.model';
import { Promo } from '../promo/promo.model';
import { AVERAGE_SPEED_KMH, ICancellation, IRide, NearestRidesProps } from './ride.interface';
import { Ride } from './ride.model';

const createRide = async (payload: IRide) => {

      // Add initial statusHistory for tracking
    payload.statusHistory = [{ status: 'REQUESTED', changedAt: new Date() }];
    payload.distanceKm = payload.distanceKm || 0;
    payload.durationMin = payload.durationMin || 0;
    payload.estimatedFare = payload.estimatedFare || 0;
    payload.totalFare = payload.totalFare || 0;
    payload.driverEarning = payload.driverEarning || 0;
    payload.adminCommission = payload.adminCommission || 0;
    
  return await Ride.create(payload);
};

const driverAcceptRide = async (rideId: string, driverId: string) => {
  const ride = await Ride.findOne({ _id: rideId, driver: null });
  if (!ride) throw new Error('Ride not found or already accepted');

  ride.driver = new Types.ObjectId(driverId);
  ride.driverAcceptedAt = new Date();
  ride.status = 'ACCEPTED';

  // Initialize statusHistory if undefined
  if (!ride.statusHistory) {
    ride.statusHistory = [];
  }

  ride.statusHistory.push({ status: 'ACCEPTED', changedAt: new Date() });

  return await ride.save();
};

const updateRideStatus = async (rideId: string, status: IRide['status']): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  // Update status
  ride.status = status;

  // Initialize statusHistory if undefined
  if (!ride.statusHistory) {
    ride.statusHistory = [];
  }

  // Push new status into history
  ride.statusHistory.push({ status, changedAt: new Date() });

  // Save and return updated ride
  return await ride.save();
};


const getPassengerRides = async (
  passengerId: string,
  query: Record<string, unknown>
) => {
  const rideQuery = new QueryBuilder(
    Ride.find({ passenger: passengerId, isDeleted: false })
      .populate('driver')
      .sort({ createdAt: -1 }),
    query
  )
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta = await rideQuery.countTotal();

  return { meta, result };
};

const getDriverRides = async (
  driverId: string,
  query: Record<string, unknown>
) => {
    
  const rideQuery = new QueryBuilder(
    Ride.find({ driver: driverId, isDeleted: false })
      .populate('passenger')
      .sort({ createdAt: -1 }),
    query
  )
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta = await rideQuery.countTotal();

  return { meta, result };
};



interface EstimateRideOptionsProps {
  distanceKm: number;
  country: string;
}

const estimateRideOptions = async ({
  distanceKm,
  country,
}: EstimateRideOptionsProps) => {
  if (!distanceKm || isNaN(Number(distanceKm))) {
    throw new Error("Invalid distanceKm value");
  }

  distanceKm = Number(distanceKm);

  const fare = await Fare.findOne({
    country: country.toUpperCase(),
    isActive: true,
  });

  if (!fare) {
    throw new Error('Fare configuration not found for this country');
  }

  const vehicleConfigs: {
    vehicleType: TVehicleType;
    pricing: {
      baseFee: number;
      bookingFee: number;
      ratePerKm: number;
      minimumFare: number;
    };
  }[] = [
    {
      vehicleType: 'MINO_GO',
      pricing: fare.minoGo,
    },
    {
      vehicleType: 'MINO_COMFORT',
      pricing: fare.minoGo, // same as GO
    },
    {
      vehicleType: 'MINO_XL',
      pricing: fare.minoXL,
    },
    {
      vehicleType: 'MINO_MOTO',
      pricing: fare.minoMoto,
    },
  ];

  return vehicleConfigs.map(({ vehicleType, pricing }) => {
    // Base fare calculation
    let estimatedFare =
      pricing.baseFee +
      pricing.bookingFee +
      pricing.ratePerKm * distanceKm;

    if (estimatedFare < pricing.minimumFare) {
      estimatedFare = pricing.minimumFare;
    }

    // Add surcharge if enabled
    let totalFare = estimatedFare;
    if (fare.surcharge?.enabled) {
      totalFare += fare.surcharge.value;
    }

    // Waiting charge calculation
    if (fare.waitingCharge?.enabled) {
      // For simplicity, assume user waits full gracePeriod minutes
      totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;
    }

    // Admin commission
    const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
    const driverEarning = totalFare - adminCommission;

    // Estimated arrival time
    const speed = AVERAGE_SPEED_KMH[vehicleType] || 40; // fallback speed
    const estimatedTimeMin = Math.ceil((distanceKm / speed) * 60);

    return {
      vehicleType,
      estimatedFare: Math.round(estimatedFare),
      totalFare: Math.round(totalFare),
      driverEarning: Math.round(driverEarning),
      adminCommission: Math.round(adminCommission),
      estimatedArrivalTimeMin: estimatedTimeMin,
      isAvailable: true,
    };
  });
};


const applyPromoToRide = async (rideId: string, promoCode: string) => {
  // 1️⃣ Find the ride
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  if (!ride.totalFare || ride.totalFare <= 0) {
    throw new Error('Ride totalFare is not set yet');
  }

  // 2️⃣ Find valid promo
  const promo = await Promo.findOne({
    title: promoCode,
    status: 'ACTIVE',
    expirationDate: { $gte: new Date() },
    isDeleted: false,
  });

  if (!promo) throw new Error('Invalid or expired promo code');

  // 3️⃣ Check minimum spend
  if (ride.totalFare < promo.minimumSpend) {
    throw new Error(`Ride must cost at least ${promo.minimumSpend} to use this promo`);
  }

  // 4️⃣ Get fare configuration for this ride
  const fare = await Fare.findOne({
    country: ride.country,
    isActive: true,
  });

  if (!fare) throw new Error('Fare configuration not found for this country');

  const platformCommissionPercent = fare.platformCommissionPercentage || 0;

  // 5️⃣ Calculate discount safely
  const discount = Math.min(promo.discount, ride.totalFare);

  // 6️⃣ Apply promo
  ride.promo = promo._id;
  ride.promoDiscount = discount;
  ride.totalFare = ride.totalFare - discount;

  // 7️⃣ Update driver/admin earnings dynamically
  ride.adminCommission = (ride.totalFare * platformCommissionPercent) / 100;
  ride.driverEarning = ride.totalFare - ride.adminCommission;

  // 8️⃣ Save ride
  await ride.save();

  // 9️⃣ Return ride info for UI
  return {
    rideId: ride._id,
    estimatedFare: ride.estimatedFare,
    totalFare: ride.totalFare,
    promoDiscount: ride.promoDiscount,
    driverEarning: ride.driverEarning,
    adminCommission: ride.adminCommission,
    promoApplied: promo.title,
  };
};

const cancelRide = async (
  rideId: string,
  cancelledBy: 'PASSENGER' | 'DRIVER' | 'SYSTEM',
  reason: string,
  details?: string
) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  // Initialize cancellations array if undefined
  if (!ride.cancellations) {
    ride.cancellations = [];
  }

  // Add cancellation record
  const cancellation: ICancellation = {
    cancelledBy,
    reason,
    details,
    timestamp: new Date(),
  };
  ride.cancellations.push(cancellation);

  // Update ride status
  ride.status = 'CANCELLED';

  await ride.save();
  return ride;

};


const adminGetAllRides = async (query: Record<string, unknown>) => {
  const rideQuery = new QueryBuilder(
    Ride.find({ isDeleted: false })
      .populate('passenger')
      .populate('driver'),
    query
  )
    .search(['status', 'serviceType'])
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta = await rideQuery.countTotal();

  return { meta, result };
};


const getNearestRides = async ({
    driverLocation,
    maxDistanceMeters = 5000, // default 5km radius
    now = new Date(),
  }: NearestRidesProps) => {
    // Find rides that are:
    // 1. Not assigned to any driver
    // 2. Status is REQUESTED
    // 3. Either immediate or scheduled in the future
    return await Ride.find({
      driver: null,
      status: 'REQUESTED',
      $or: [
      { scheduledAt: { $exists: false } }, // immediate rides
      { scheduledAt: { $gte: now } }       // future scheduled rides
      ],
      'pickupLocation.location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: driverLocation,
          },
          $maxDistance: maxDistanceMeters,
        },
      },
    }).limit(20); // optional: limit number of rides for performance
  }

export const RideService = {
  createRide,
  getPassengerRides,
  getDriverRides,
  driverAcceptRide,
  updateRideStatus,
  estimateRideOptions,
  applyPromoToRide,
  cancelRide,
  adminGetAllRides,
  getNearestRides
};
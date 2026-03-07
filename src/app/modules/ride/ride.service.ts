import { Types } from 'mongoose';
import QueryBuilder from '../../builder/QueryBuilder';
import { TVehicleType } from '../driver/driver.interface';
import { Fare } from '../fare/fare.model';
import { Promo } from '../promo/promo.model';
import {
  isManagerReady,
  broadcastRideRequestToNearbyDrivers,
  getOnlineDriverEntry,
  emitToPassenger,
  emitToDriver,
  emitToRideRoom,
  setDriverOnRide,
} from '../../../socket/socket.manager';
import { User } from '../user/user.model';
import { Driver } from '../driver/driver.model';
import { getDistanceKm } from './ride.utils';
import { SocketEvents } from '../../../socket/socket.types';
import { logger } from '../../utils/logger';
import {
  AVERAGE_SPEED_KMH,
  ICancellation,
  IRide,
  NearestRidesProps,
} from './ride.interface';
import { Ride } from './ride.model';

// ─────────────────────────────────────────────────────────────────────────────

const createRide = async (payload: IRide) => {
  
  payload.statusHistory = [{ status: 'REQUESTED', changedAt: new Date() }];
  payload.distanceKm    = payload.distanceKm    || 0;
  payload.durationMin   = payload.durationMin   || 0;
  payload.estimatedFare = payload.estimatedFare || 0;
  payload.totalFare     = payload.totalFare     || 0;
  payload.driverEarning = payload.driverEarning || 0;
  payload.adminCommission = payload.adminCommission || 0;

  // const ride = await Ride.create(payload);
  const ride = await Ride.create(payload);


  // Emit: notify nearby online drivers about the new ride request
  try {
    if (isManagerReady()) {
      const passenger = await User.findById(ride.passenger).select('name profileImage averageRating').lean();

      await broadcastRideRequestToNearbyDrivers(
        ride.pickupLocation.location.coordinates,
        {
          rideId:                  ride._id.toString(),
          passengerId:             ride.passenger.toString(),
          passengerName:           passenger?.name ?? '',
          passengerProfileImage:   passenger?.profileImage ?? '',
          passengerAverageRating:  passenger?.averageRating ?? 0,
          vehicleCategory:         ride.vehicleCategory,
          serviceType:             ride.serviceType,
          pickupLocation: {
            address:     ride.pickupLocation.address,
            coordinates: ride.pickupLocation.location.coordinates,
          },
          dropoffLocation: {
            address:     ride.dropoffLocation.address,
            coordinates: ride.dropoffLocation.location.coordinates,
          },
          estimatedFare: ride.estimatedFare,
          totalFare:     ride.totalFare,
          distanceKm:    ride.distanceKm,
          scheduledAt:   ride.scheduledAt,
          pickupType:    ride.pickupType,
          parcelDetails: ride.parcelDetails,
          paymentMethod: payload.paymentMethod,
        },
      );
    }
  } catch (err) {
    logger.warn('createRide: socket emission failed (non-critical):', err);
  }

  return ride;
};

// ─────────────────────────────────────────────────────────────────────────────

const driverAcceptRide = async (rideId: string, driverId: string) => {
  const ride = await Ride.findOne({ _id: rideId, driver: null });
  if (!ride) throw new Error('Ride not found or already accepted');

  ride.driver          = new Types.ObjectId(driverId);
  ride.driverAcceptedAt = new Date();
  ride.status          = 'ACCEPTED';

  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'ACCEPTED', changedAt: new Date() });

  const saved = await ride.save();

  // Emit: tell the passenger their ride was accepted (with enriched driver info)
  try {
    if (isManagerReady()) {
      // Fetch driver profile + linked user in parallel
      const driverDoc = await Driver.findById(driverId)
        .select('userId vehicleBrand vehicleModel licenseNumber vehicleType currentLocation')
        .lean();

      const userDoc = driverDoc
        ? await User.findById(driverDoc.userId)
            .select('name profileImage averageRating phoneNumber countryCode')
            .lean()
        : null;

      // Distance from driver's current location to pickup
      const driverEntry = getOnlineDriverEntry(driverId);
      const driverCoords: [number, number] =
        driverEntry?.location ?? driverDoc?.currentLocation?.coordinates ?? [0, 0];

      const [pickupLng, pickupLat] = saved.pickupLocation.location.coordinates;
      const [driverLng, driverLat] = driverCoords;
      const distanceToPickupKm = getDistanceKm(pickupLat, pickupLng, driverLat, driverLng);
      const speed = AVERAGE_SPEED_KMH[driverDoc?.vehicleType as TVehicleType] ?? 40;
      const estimatedArrivalMin = Math.ceil((distanceToPickupKm / speed) * 60);

      const payload = {
        rideId:               saved._id.toString(),
        driverProfileId:      driverId,
        driverName:           userDoc?.name           ?? '',
        driverProfileImage:   userDoc?.profileImage   ?? '',
        driverAverageRating:  userDoc?.averageRating  ?? 0,
        driverPhoneNumber:    userDoc?.phoneNumber     ?? '',
        driverCountryCode:    userDoc?.countryCode     ?? '',
        vehicleBrand:         driverDoc?.vehicleBrand  ?? '',
        vehicleModel:         driverDoc?.vehicleModel  ?? '',
        licenseNumber:        driverDoc?.licenseNumber ?? '',
        driverCurrentLocation: { lat: driverLat, lng: driverLng },
        estimatedArrivalMin,
        acceptedAt:           saved.driverAcceptedAt,
      };

      const statusPayload = {
        rideId:    saved._id.toString(),
        status: "ACCEPTED",
        changedAt: new Date(),
      };

      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, statusPayload);

      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_ACCEPTED, payload);
      emitToRideRoom(rideId, SocketEvents.RIDE_ACCEPTED, payload);
    }
  } catch (err) {
    logger.warn('driverAcceptRide: socket emission failed (non-critical):', err);
  }

  return saved;
};

// ─────────────────────────────────────────────────────────────────────────────

const updateRideStatus = async (
  rideId: string,
  status: IRide['status'],
): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  ride.status = status;
  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status, changedAt: new Date() });

  const saved = await ride.save();

  // Emit: broadcast status change to everyone in the ride room
  try {
    if (isManagerReady()) {
      const statusPayload = {
        rideId:    saved._id.toString(),
        status,
        changedAt: new Date(),
      };

      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, statusPayload);

      if (status === 'ONGOING') {
        emitToRideRoom(rideId, SocketEvents.RIDE_STARTED, statusPayload);
      } else if (status === 'COMPLETED') {
        emitToRideRoom(rideId, SocketEvents.RIDE_COMPLETED, statusPayload);
        if (saved.driver) setDriverOnRide(saved.driver.toString(), false);
      }
    }
  } catch (err) {
    logger.warn('updateRideStatus: socket emission failed (non-critical):', err);
  }

  return saved;
};

// ─────────────────────────────────────────────────────────────────────────────

const getPassengerRides = async (
  passengerId: string,
  query: Record<string, unknown>,
) => {
  const rideQuery = new QueryBuilder(
    Ride.find({ passenger: passengerId, isDeleted: false })
      .populate('driver')
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

const getDriverRides = async (
  driverId: string,
  query: Record<string, unknown>,
) => {
  const rideQuery = new QueryBuilder(
    Ride.find({ driver: driverId, isDeleted: false })
      .populate('passenger')
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

interface EstimateRideOptionsProps {
  distanceKm: number;
  country: string;
}

const estimateRideOptions = async ({
  distanceKm,
  country,
}: EstimateRideOptionsProps) => {
  if (!distanceKm || isNaN(Number(distanceKm))) {
    throw new Error('Invalid distanceKm value');
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
    { vehicleType: 'MINO_GO',      pricing: fare.minoGo   },
    { vehicleType: 'MINO_COMFORT', pricing: fare.minoGo   }, // same as GO
    { vehicleType: 'MINO_XL',      pricing: fare.minoXL   },
    { vehicleType: 'MINO_MOTO',    pricing: fare.minoMoto },
  ];

  return vehicleConfigs.map(({ vehicleType, pricing }) => {
    let estimatedFare =
      pricing.baseFee + pricing.bookingFee + pricing.ratePerKm * distanceKm;

    if (estimatedFare < pricing.minimumFare) {
      estimatedFare = pricing.minimumFare;
    }

    let totalFare = estimatedFare;
    if (fare.surcharge?.enabled) {
      totalFare += fare.surcharge.value;
    }

    if (fare.waitingCharge?.enabled) {
      totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;
    }

    const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
    const driverEarning   = totalFare - adminCommission;

    const speed            = AVERAGE_SPEED_KMH[vehicleType] || 40;
    const estimatedTimeMin = Math.ceil((distanceKm / speed) * 60);

    return {
      vehicleType,
      estimatedFare:          Math.round(estimatedFare),
      totalFare:              Math.round(totalFare),
      driverEarning:          Math.round(driverEarning),
      adminCommission:        Math.round(adminCommission),
      estimatedArrivalTimeMin: estimatedTimeMin,
      isAvailable:            true,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────

const applyPromoToRide = async (rideId: string, promoCode: string) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  if (!ride.totalFare || ride.totalFare <= 0) {
    throw new Error('Ride totalFare is not set yet');
  }

  const promo = await Promo.findOne({
    title: promoCode,
    status: 'ACTIVE',
    expirationDate: { $gte: new Date() },
    isDeleted: false,
  });

  if (!promo) throw new Error('Invalid or expired promo code');

  if (ride.totalFare < promo.minimumSpend) {
    throw new Error(
      `Ride must cost at least ${promo.minimumSpend} to use this promo`,
    );
  }

  const fare = await Fare.findOne({ country: ride.country, isActive: true });
  if (!fare) throw new Error('Fare configuration not found for this country');

  const platformCommissionPercent = fare.platformCommissionPercentage || 0;
  const discount = Math.min(promo.discount, ride.totalFare);

  ride.promo           = promo._id;
  ride.promoDiscount   = discount;
  ride.totalFare       = ride.totalFare - discount;
  ride.adminCommission = (ride.totalFare * platformCommissionPercent) / 100;
  ride.driverEarning   = ride.totalFare - ride.adminCommission;

  await ride.save();

  const result = {
    rideId:          ride._id,
    estimatedFare:   ride.estimatedFare,
    totalFare:       ride.totalFare,
    promoDiscount:   ride.promoDiscount,
    driverEarning:   ride.driverEarning,
    adminCommission: ride.adminCommission,
    promoApplied:    promo.title,
  };

  // Emit: confirm applied promo to passenger
  try {
    if (isManagerReady()) {
      emitToPassenger(ride.passenger.toString(), SocketEvents.PROMO_APPLIED, {
        rideId:          ride._id.toString(),
        promoCode:       promo.title,
        promoDiscount:   ride.promoDiscount,
        totalFare:       ride.totalFare,
        driverEarning:   ride.driverEarning,
        adminCommission: ride.adminCommission,
      });
    }
  } catch (err) {
    logger.warn('applyPromoToRide: socket emission failed (non-critical):', err);
  }

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────

const cancelRide = async (
  rideId: string,
  cancelledBy: 'PASSENGER' | 'DRIVER' | 'SYSTEM',
  reason: string,
  details?: string,
) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new Error('Ride not found');

  if (!ride.cancellations) ride.cancellations = [];

  const cancellation: ICancellation = {
    cancelledBy,
    reason,
    details,
    timestamp: new Date(),
  };
  ride.cancellations.push(cancellation);

  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'CANCELLED', changedAt: new Date() });

  ride.status = 'CANCELLED';

  await ride.save();

  // Emit: notify all parties about the cancellation
  try {
    if (isManagerReady()) {
      const cancelPayload = {
        rideId: ride._id.toString(),
        cancelledBy,
        reason,
        details,
      };
      emitToRideRoom(rideId, SocketEvents.RIDE_CANCELLED, cancelPayload);
      emitToPassenger(ride.passenger.toString(), SocketEvents.RIDE_CANCELLED, cancelPayload);

      if (ride.driver) {
        emitToDriver(ride.driver.toString(), SocketEvents.RIDE_CANCELLED, cancelPayload);
        setDriverOnRide(ride.driver.toString(), false);
      }
    }
  } catch (err) {
    logger.warn('cancelRide: socket emission failed (non-critical):', err);
  }

  return ride;
};

// ─────────────────────────────────────────────────────────────────────────────

const adminGetAllRides = async (query: Record<string, unknown>) => {
  const rideQuery = new QueryBuilder(
    Ride.find({ isDeleted: false }).populate('passenger').populate('driver'),
    query,
  )
    .search(['status', 'serviceType'])
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta   = await rideQuery.countTotal();

  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

const getNearestRides = async ({
  driverLocation,
  maxDistanceMeters = 5_000,
  now = new Date(),
}: NearestRidesProps) => {
  return await Ride.find({
    driver: null,
    status: 'REQUESTED',
    $or: [
      { scheduledAt: { $exists: false } },
      { scheduledAt: { $gte: now } },
    ],
    'pickupLocation.location': {
      $near: {
        $geometry: { type: 'Point', coordinates: driverLocation },
        $maxDistance: maxDistanceMeters,
      },
    },
  }).limit(20);
};


const getRecentRides = async (userId: string, role: 'passenger' | 'driver', query: Record<string, unknown>) => {
  const filter =
    role === 'driver'
      ? { driver: userId, isDeleted: false }
      : { passenger: userId, isDeleted: false };

  const rideQuery = new QueryBuilder(
     Ride.find(filter).select(
      'pickupLocation dropoffLocation status distanceKm durationMin createdAt scheduledAt pickupType'
    ),
    query,
  )
    .search(['status', 'serviceType'])
    .filter()
    .paginate();

  const result = await rideQuery.modelQuery;
  const meta   = await rideQuery.countTotal();

  return { meta, result };
};

// ─────────────────────────────────────────────────────────────────────────────

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
  getNearestRides,
  getRecentRides
};

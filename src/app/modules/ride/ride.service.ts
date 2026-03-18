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
  ILocation,
  IRide,
  NearestRidesProps,
  IReviewEntry,
} from './ride.interface';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import { Ride } from './ride.model';
import { PaymentService } from '../payment/payment.service';

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
      // Always emit directly to passenger — guards against missed room joins
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_STATUS_UPDATED, statusPayload);

      if (status === 'ONGOING') {
        emitToRideRoom(rideId, SocketEvents.RIDE_STARTED, statusPayload);
        emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_STARTED, statusPayload);
      } else if (status === 'COMPLETED') {
        emitToRideRoom(rideId, SocketEvents.RIDE_COMPLETED, statusPayload);
        emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_COMPLETED, statusPayload);
        if (saved.driver) setDriverOnRide(saved.driver.toString(), false);

        // Auto-create payment record for CASH rides on completion
        if (saved.paymentMethod === 'CASH' && saved.driver) {
          PaymentService.createPayment({
            rideId:        saved._id.toString(),
            passengerId:   saved.passenger.toString(),
            driverId:      saved.driver.toString(),
            amount:        saved.totalFare ?? 0,
            tip:           saved.tip ?? 0,
            paymentMethod: 'CASH',
          }).catch((err) =>
            logger.warn('updateRideStatus: CASH payment record creation failed:', err),
          );
        }
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

const endRide = async (
  rideId: string,
  driverId: string,
  dropoffLocation: ILocation,
): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (!ride.driver || ride.driver.toString() !== driverId) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not the driver of this ride');
  }

  if (ride.status !== 'ONGOING') {
    throw new AppError(httpStatus.BAD_REQUEST, `Cannot end ride in status: ${ride.status}`);
  }

  // ── Calculate actual distance & duration ──────────────────────────────────
  const [pickupLng, pickupLat] = ride.pickupLocation.location.coordinates;
  const [dropoffLng, dropoffLat] = dropoffLocation.location.coordinates;
  const actualDistanceKm = getDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);

  const speed = AVERAGE_SPEED_KMH[ride.vehicleCategory as keyof typeof AVERAGE_SPEED_KMH] ?? 40;
  const actualDurationMin = Math.ceil((actualDistanceKm / speed) * 60);

  // ── Recalculate fares using actual distance ────────────────────────────────
  const fare = await Fare.findOne({ country: ride.country, isActive: true });
  if (!fare) throw new AppError(httpStatus.BAD_REQUEST, 'Fare configuration not found for this country');

  const pricingMap: Record<string, typeof fare.minoGo> = {
    MINO_GO:      fare.minoGo,
    MINO_COMFORT: fare.minoGo,
    MINO_XL:      fare.minoXL,
    MINO_MOTO:    fare.minoMoto,
  };
  const pricing = pricingMap[ride.vehicleCategory] ?? fare.minoGo;

  let estimatedFare = pricing.baseFee + pricing.bookingFee + pricing.ratePerKm * actualDistanceKm;
  if (estimatedFare < pricing.minimumFare) estimatedFare = pricing.minimumFare;

  let totalFare = estimatedFare;
  if (fare.surcharge?.enabled)     totalFare += fare.surcharge.value;
  if (fare.waitingCharge?.enabled) totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;

  // Re-apply promo discount if already set
  const promoDiscount = ride.promoDiscount ?? 0;
  totalFare = Math.max(0, totalFare - promoDiscount);

  const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
  const driverEarning   = totalFare - adminCommission;

  // ── Persist ────────────────────────────────────────────────────────────────
  ride.status                = 'END_RIDE';
  ride.actualDropoffLocation = dropoffLocation;
  ride.distanceKm            = Math.round(actualDistanceKm * 100) / 100;
  ride.durationMin           = actualDurationMin;
  ride.estimatedFare         = Math.round(estimatedFare);
  ride.totalFare             = Math.round(totalFare);
  ride.adminCommission       = Math.round(adminCommission);
  ride.driverEarning         = Math.round(driverEarning);

  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'END_RIDE', changedAt: new Date() });

  const saved = await ride.save();

  // ── Emit ───────────────────────────────────────────────────────────────────
  try {
    if (isManagerReady()) {
      const endPayload = {
        rideId: saved._id.toString(),
        actualDropoffLocation: {
          address: dropoffLocation.address,
          coordinates: dropoffLocation.location.coordinates,
        },
        distanceKm:      ride.distanceKm,
        durationMin:     ride.durationMin,
        estimatedFare:   ride.estimatedFare,
        totalFare:       ride.totalFare,
        driverEarning:   ride.driverEarning,
        adminCommission: ride.adminCommission,
        changedAt:       new Date(),
      };

      const endStatusPayload = { rideId: saved._id.toString(), status: 'END_RIDE', changedAt: new Date() };
      emitToRideRoom(rideId, SocketEvents.RIDE_ENDED, endPayload);
      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, endStatusPayload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_ENDED, endPayload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_STATUS_UPDATED, endStatusPayload);
    }
  } catch (err) {
    logger.warn('endRide: socket emission failed (non-critical):', err);
  }

  return saved;
};

// ─────────────────────────────────────────────────────────────────────────────

const arrivedDropoff = async (
  rideId: string,
  driverId: string,
  dropoffLocation: ILocation,
): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (!ride.driver || ride.driver.toString() !== driverId) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not the driver of this ride');
  }

  if (ride.status !== 'ONGOING') {
    throw new AppError(httpStatus.BAD_REQUEST, `Cannot arrive at dropoff in status: ${ride.status}`);
  }

  // ── Calculate actual distance & duration ──────────────────────────────────
  const [pickupLng, pickupLat] = ride.pickupLocation.location.coordinates;
  const [dropoffLng, dropoffLat] = dropoffLocation.location.coordinates;
  const actualDistanceKm = getDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);

  const speed = AVERAGE_SPEED_KMH[ride.vehicleCategory as keyof typeof AVERAGE_SPEED_KMH] ?? 40;
  const actualDurationMin = Math.ceil((actualDistanceKm / speed) * 60);

  // ── Recalculate fares using actual distance ────────────────────────────────
  const fare = await Fare.findOne({ country: ride.country, isActive: true });
  if (!fare) throw new AppError(httpStatus.BAD_REQUEST, 'Fare configuration not found for this country');

  const pricingMap: Record<string, typeof fare.minoGo> = {
    MINO_GO:      fare.minoGo,
    MINO_COMFORT: fare.minoGo,
    MINO_XL:      fare.minoXL,
    MINO_MOTO:    fare.minoMoto,
  };
  const pricing = pricingMap[ride.vehicleCategory] ?? fare.minoGo;

  let estimatedFare = pricing.baseFee + pricing.bookingFee + pricing.ratePerKm * actualDistanceKm;
  if (estimatedFare < pricing.minimumFare) estimatedFare = pricing.minimumFare;

  let totalFare = estimatedFare;
  if (fare.surcharge?.enabled)     totalFare += fare.surcharge.value;
  if (fare.waitingCharge?.enabled) totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;

  const promoDiscount = ride.promoDiscount ?? 0;
  totalFare = Math.max(0, totalFare - promoDiscount);

  const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
  const driverEarning   = totalFare - adminCommission;

  // ── Persist ────────────────────────────────────────────────────────────────
  ride.status          = 'ARRIVED_DROPOFF';
  ride.dropoffLocation = dropoffLocation;
  ride.distanceKm      = Math.round(actualDistanceKm * 100) / 100;
  ride.durationMin     = actualDurationMin;
  ride.estimatedFare   = Math.round(estimatedFare);
  ride.totalFare       = Math.round(totalFare);
  ride.adminCommission = Math.round(adminCommission);
  ride.driverEarning   = Math.round(driverEarning);

  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'ARRIVED_DROPOFF', changedAt: new Date() });

  const saved = await ride.save();

  // ── Emit ───────────────────────────────────────────────────────────────────
  try {
    if (isManagerReady()) {
      const arrivedPayload = {
        rideId: saved._id.toString(),
        dropoffLocation: {
          address:     dropoffLocation.address,
          coordinates: dropoffLocation.location.coordinates,
        },
        distanceKm:      ride.distanceKm,
        durationMin:     ride.durationMin,
        estimatedFare:   ride.estimatedFare,
        totalFare:       ride.totalFare,
        driverEarning:   ride.driverEarning,
        adminCommission: ride.adminCommission,
        changedAt:       new Date(),
      };

      const statusPayload = { rideId: saved._id.toString(), status: 'ARRIVED_DROPOFF', changedAt: new Date() };
      emitToRideRoom(rideId, SocketEvents.RIDE_ENDED, arrivedPayload);
      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, statusPayload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_ENDED, arrivedPayload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_STATUS_UPDATED, statusPayload);
    }
  } catch (err) {
    logger.warn('arrivedDropoff: socket emission failed (non-critical):', err);
  }

  return saved;
};

// ─────────────────────────────────────────────────────────────────────────────

const confirmDropoff = async (rideId: string, driverId: string): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (!ride.driver || ride.driver.toString() !== driverId) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not the driver of this ride');
  }

  if (ride.status !== 'END_RIDE' && ride.status !== 'ARRIVED_DROPOFF') {
    throw new AppError(httpStatus.BAD_REQUEST, `Cannot confirm dropoff in status: ${ride.status}`);
  }

  ride.status = 'CONFIRM_DROPOFF';
  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'CONFIRM_DROPOFF', changedAt: new Date() });

  const saved = await ride.save();

  // Emit fare summary to passenger so they can review + add tip (CARD payments)
  try {
    if (isManagerReady()) {
      const payload = {
        rideId:          saved._id.toString(),
        distanceKm:      saved.distanceKm,
        durationMin:     saved.durationMin,
        estimatedFare:   saved.estimatedFare,
        totalFare:       saved.totalFare ?? 0,
        driverEarning:   saved.driverEarning ?? 0,
        adminCommission: saved.adminCommission ?? 0,
        promoDiscount:   saved.promoDiscount ?? 0,
        paymentMethod:   saved.paymentMethod,
        changedAt:       new Date(),
      };

      const confirmStatusPayload = { rideId: saved._id.toString(), status: 'CONFIRM_DROPOFF', changedAt: new Date() };
      emitToRideRoom(rideId, SocketEvents.RIDE_CONFIRM_DROPOFF, payload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_CONFIRM_DROPOFF, payload);
      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, confirmStatusPayload);
      emitToPassenger(saved.passenger.toString(), SocketEvents.RIDE_STATUS_UPDATED, confirmStatusPayload);
    }
  } catch (err) {
    logger.warn('confirmDropoff: socket emission failed (non-critical):', err);
  }

  return saved;
};

// ─────────────────────────────────────────────────────────────────────────────

const payRide = async (rideId: string, passengerId: string, tip = 0): Promise<IRide> => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');

  if (ride.passenger.toString() !== passengerId) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not the passenger of this ride');
  }

  if (ride.status !== 'CONFIRM_DROPOFF') {
    throw new AppError(httpStatus.BAD_REQUEST, `Payment not allowed in status: ${ride.status}`);
  }

  if (ride.paymentMethod !== 'CASH') {
    throw new AppError(httpStatus.BAD_REQUEST, 'This endpoint is only for CASH payments. CARD payments are handled via Stripe.');
  }

  if (ride.paymentStatus === 'PAID') {
    throw new AppError(httpStatus.CONFLICT, 'Ride already paid');
  }

  // ── Apply tip ─────────────────────────────────────────────────────────────
  const tipAmount = Math.max(0, Math.round(tip));
  const newTotalFare = (ride.totalFare ?? 0) + tipAmount;

  const fare = await Fare.findOne({ country: ride.country, isActive: true });
  const commissionPct = fare?.platformCommissionPercentage ?? 0;

  // Tip goes entirely to driver (not subject to commission)
  const adminCommission = Math.round(((ride.totalFare ?? 0) * commissionPct) / 100);
  const driverEarning   = Math.round(newTotalFare - adminCommission);

  ride.tip             = tipAmount;
  ride.totalFare       = newTotalFare;
  ride.adminCommission = adminCommission;
  ride.driverEarning   = driverEarning;
  ride.paymentStatus   = 'PAID';
  ride.status          = 'COMPLETED';

  if (!ride.statusHistory) ride.statusHistory = [];
  ride.statusHistory.push({ status: 'COMPLETED', changedAt: new Date() });

  const saved = await ride.save();

  // Credit driver wallet
  if (saved.driver) {
    const earning = saved.driverEarning ?? 0;
    Driver.findByIdAndUpdate(saved.driver, {
      $inc: { walletBalance: earning, totalEarnings: earning, totalTrips: 1 },
    }).catch((err) => logger.warn('payRide: driver wallet credit failed:', err));
  }

  // Create CASH payment record
  try {
    await PaymentService.createPayment({
      rideId:        saved._id.toString(),
      passengerId:   saved.passenger.toString(),
      driverId:      saved.driver!.toString(),
      amount:        saved.totalFare ?? 0,
      tip:           tipAmount,
      paymentMethod: 'CASH',
    });
  } catch (err) {
    logger.warn('payRide: payment record creation failed (non-critical):', err);
  }

  try {
    if (isManagerReady()) {
      const paidPayload = {
        rideId:          saved._id.toString(),
        tip:             tipAmount,
        totalFare:       saved.totalFare ?? 0,
        driverEarning:   saved.driverEarning ?? 0,
        adminCommission: saved.adminCommission ?? 0,
        paymentStatus:   'PAID',
        changedAt:       new Date(),
      };

      emitToRideRoom(rideId, SocketEvents.RIDE_COMPLETED, paidPayload);
      emitToRideRoom(rideId, SocketEvents.RIDE_STATUS_UPDATED, {
        rideId: saved._id.toString(),
        status: 'COMPLETED',
        changedAt: new Date(),
      });
      if (saved.driver) {
        emitToDriver(saved.driver.toString(), SocketEvents.RIDE_COMPLETED, paidPayload);
        setDriverOnRide(saved.driver.toString(), false);
      }
    }
  } catch (err) {
    logger.warn('payRide: socket emission failed (non-critical):', err);
  }

  return saved;
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
    Ride.find({ isDeleted: false }).populate('passenger', "name profileImage").populate('driver', 'name profileImage'),
    query,
  )
    .search(['rideId', 'status', 'serviceType'])
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


// ─────────────────────────────────────────────────────────────────────────────

const UPCOMING_STATUSES: IRide['status'][] = [
  'REQUESTED',
  'ACCEPTED',
  'ARRIVED_PICKUP',
  'ONGOING',
  'ARRIVED_DROPOFF',
];

type TRideStatusFilter = 'completed' | 'cancelled' | 'upcoming';

const getRidesByStatus = async (
  id: string,
  role: 'passenger' | 'driver',
  status: TRideStatusFilter,
  query: Record<string, unknown>,
) => {
  const roleFilter  = role === 'passenger' ? { passenger: id } : { driver: id };
  const statusFilter =
    status === 'upcoming'
      ? { status: { $in: UPCOMING_STATUSES } }
      : { status: status.toUpperCase() };

  // Passenger sees driver info (Driver doc + nested User for name/photo)
  // Driver sees passenger info (User doc fields only)
  const populateOption =
    role === 'passenger'
      ? {
          path: 'driver',
          select: 'licenseNumber vehicleModel vehicleBrand userId',
          populate: {
            path: 'userId',
            select: 'name profileImage',
          },
        }
      : {
          path: 'passenger',
          select: 'name profileImage averageRating',
        };

  const rideQuery = new QueryBuilder(
    Ride.find({ ...roleFilter, ...statusFilter, isDeleted: false })
      .populate(populateOption)
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

const submitRideReview = async (
  rideId: string,
  reviewerRole: 'passenger' | 'driver',
  payload: Pick<IReviewEntry, 'rating' | 'comment'>,
) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new AppError(httpStatus.NOT_FOUND, 'Ride not found');
  if (ride.status !== 'COMPLETED') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only completed rides can be reviewed');
  }

  const reviewEntry: IReviewEntry = {
    rating:  payload.rating,
    comment: payload.comment ?? '',
    givenAt: new Date(),
  };

  if (reviewerRole === 'passenger') {
    if (ride.isPassengerReviewed) {
      throw new AppError(httpStatus.CONFLICT, 'You have already reviewed this ride');
    }
    ride.passengerReview    = reviewEntry;
    ride.isPassengerReviewed = true;

    // Update driver's user rating stats
    if (ride.driver) {
      const driverDoc = await Driver.findById(ride.driver).select('userId').lean();
      if (driverDoc) {
        await User.findByIdAndUpdate(driverDoc.userId, {
          $inc: { rating: payload.rating, totalReview: 1 },
        });
        const updated = await User.findById(driverDoc.userId).select('rating totalReview');
        if (updated && updated.totalReview > 0) {
          updated.averageRating = updated.rating / updated.totalReview;
          await updated.save();
        }
      }
    }
  } else {
    if (ride.isDriverReviewed) {
      throw new AppError(httpStatus.CONFLICT, 'You have already reviewed this ride');
    }
    ride.driverReview    = reviewEntry;
    ride.isDriverReviewed = true;

    // Update passenger's user rating stats
    await User.findByIdAndUpdate(ride.passenger, {
      $inc: { rating: payload.rating, totalReview: 1 },
    });
    const updated = await User.findById(ride.passenger).select('rating totalReview');
    if (updated && updated.totalReview > 0) {
      updated.averageRating = updated.rating / updated.totalReview;
      await updated.save();
    }
  }

  await ride.save();
  return ride;
};

// ─────────────────────────────────────────────────────────────────────────────

export const RideService = {
  createRide,
  getPassengerRides,
  getDriverRides,
  getRidesByStatus,
  submitRideReview,
  driverAcceptRide,
  updateRideStatus,
  endRide,
  arrivedDropoff,
  confirmDropoff,
  payRide,
  estimateRideOptions,
  applyPromoToRide,
  cancelRide,
  adminGetAllRides,
  getNearestRides,
  getRecentRides,
};

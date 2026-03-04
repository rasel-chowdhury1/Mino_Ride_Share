import { Driver } from "../driver/driver.model";
import { Fare } from "../fare/fare.model";


interface EstimateRideOptionsProps {
  distanceKm: number;
  country: string;
  pickupLat: number;
  pickupLng: number;
}

type TVehicleType = 'MINO_GO' | 'MINO_COMFORT' | 'MINO_XL' | 'MINO_MOTO';

const AVERAGE_SPEED_KMH: Record<TVehicleType, number> = {
  MINO_GO: 40,
  MINO_COMFORT: 40,
  MINO_XL: 35,
  MINO_MOTO: 45,
};

const NEARBY_DRIVER_RADIUS_METERS = 5000;
const FALLBACK_PICKUP_DISTANCE_KM = 2;

/**
 * Haversine formula — calculates the distance in km between two lat/lng points
 */
const getDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Finds available drivers near the pickup location and returns their average distance.
 * Falls back to FALLBACK_PICKUP_DISTANCE_KM if no drivers are found.
 */
const getAveragePickupDistanceKm = async (
  pickupLat: number,
  pickupLng: number,
  vehicleType: TVehicleType
): Promise<{ avgDistanceKm: number; hasDrivers: boolean }> => {

  const nearbyDrivers = await Driver.find({
    vehicleType,
    isOnline: true,
    isOnRide: false,           // only drivers not currently on a ride
    approvalStatus: 'verified', // only verified drivers
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [pickupLng, pickupLat], // MongoDB expects [lng, lat]
        },
        $maxDistance: NEARBY_DRIVER_RADIUS_METERS,
      },
    },
  })
    .select('currentLocation')
    .limit(10)
    .lean();



  if (!nearbyDrivers.length) {
    return { avgDistanceKm: FALLBACK_PICKUP_DISTANCE_KM, hasDrivers: false };
  }

  const totalDistance = nearbyDrivers.reduce((sum, driver) => {
    const [driverLng, driverLat] = driver.currentLocation!.coordinates;

    console.log({ driverLng, driverLat });
    console.log({ pickupLng, pickupLat });
    return sum + getDistanceKm(pickupLat, pickupLng, driverLat, driverLng);
  }, 0);


  return {
    avgDistanceKm: totalDistance / nearbyDrivers.length,
    hasDrivers: true,
  };
};


/**
 * Finds available MINO_MOTO drivers near the pickup location
 * and returns their average distance to the pickup point.
 * Falls back to FALLBACK_PICKUP_DISTANCE_KM if no drivers are found.
 */
const getMotoPickupDistanceKm = async (
  pickupLat: number,
  pickupLng: number
): Promise<{ avgDistanceKm: number; hasDrivers: boolean }> => {
  const nearbyDrivers = await Driver.find({
    vehicleType: 'MINO_MOTO',
    isOnline: true,
    isOnRide: false,
    approvalStatus: 'verified',
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [pickupLng, pickupLat], // MongoDB expects [lng, lat]
        },
        $maxDistance: NEARBY_DRIVER_RADIUS_METERS,
      },
    },
  })
    .select('currentLocation')
    .limit(10)
    .lean();

  if (!nearbyDrivers.length) {
    return { avgDistanceKm: FALLBACK_PICKUP_DISTANCE_KM, hasDrivers: false };
  }

  const totalDistance = nearbyDrivers.reduce((sum, driver) => {
    const [driverLng, driverLat] = driver.currentLocation!.coordinates;
    return sum + getDistanceKm(pickupLat, pickupLng, driverLat, driverLng);
  }, 0);

  return {
    avgDistanceKm: totalDistance / nearbyDrivers.length,
    hasDrivers: true,
  };
};

export const estimateRideOptions = async ({
  distanceKm,
  country,
  pickupLat,
  pickupLng,
}: EstimateRideOptionsProps) => {
  // ── Validation ─────────────────────────────────────────────────────────
  if (!distanceKm || isNaN(Number(distanceKm))) {
    throw new Error('Invalid distanceKm value');
  }
  if (!pickupLat || !pickupLng || isNaN(pickupLat) || isNaN(pickupLng)) {
    throw new Error('Invalid pickup location coordinates');
  }

  distanceKm = Number(distanceKm);

  // ── Fetch fare configuration for the given country ─────────────────────
  const fare = await Fare.findOne({
    country: country.toUpperCase(),
    isActive: true,
  });


  if (!fare) {
    throw new Error('Fare configuration not found for this country');
  }

  // ── Define vehicle types with their corresponding pricing config ────────
  const vehicleConfigs: {
    vehicleType: TVehicleType;
    pricing: {
      baseFee: number;
      bookingFee: number;
      ratePerKm: number;
      minimumFare: number;
    };
  }[] = [
    { vehicleType: 'MINO_GO',      pricing: fare.minoGo      },
    { vehicleType: 'MINO_COMFORT', pricing: fare.minoGo  },
    { vehicleType: 'MINO_XL',      pricing: fare.minoXL      },
    { vehicleType: 'MINO_MOTO',    pricing: fare.minoMoto     },
  ];

  // ── Fetch average pickup distance for each vehicle type in parallel ─────
  const pickupResults = await Promise.all(
    vehicleConfigs.map(({ vehicleType }) =>
      getAveragePickupDistanceKm(pickupLat, pickupLng, vehicleType)
    )
  );



  // ── Build estimate for each vehicle type ───────────────────────────────
  const result = vehicleConfigs.map(({ vehicleType, pricing }, index) => {
    const { avgDistanceKm, hasDrivers } = pickupResults[index];
    const speed = AVERAGE_SPEED_KMH[vehicleType];


    // Base fare calculation
    let estimatedFare =
      pricing.baseFee + pricing.bookingFee + pricing.ratePerKm * distanceKm;

    // Apply minimum fare if calculated fare is too low
    if (estimatedFare < pricing.minimumFare) {
      estimatedFare = pricing.minimumFare;
    }

    // Add surcharge if enabled
    let totalFare = estimatedFare;
    if (fare.surcharge?.enabled) {
      totalFare += fare.surcharge.value;
    }

    // Add waiting charge for the full grace period if enabled
    if (fare.waitingCharge?.enabled) {
      totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;
    }

    // Calculate platform commission and driver earnings
    const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
    const driverEarning = totalFare - adminCommission;

    // Time for the driver to reach the pickup location
    const estimatedArrivalTimeMin = Math.ceil((avgDistanceKm / speed) * 60);

    // Time for the ride from pickup to destination
    const estimatedRideTimeMin = Math.ceil((distanceKm / speed) * 60);

    return {
      vehicleType,
      estimatedFare: Math.round(estimatedFare),
      totalFare: Math.round(totalFare),
      driverEarning: Math.round(driverEarning),
      adminCommission: Math.round(adminCommission),
      estimatedArrivalTimeMin, // how long until the driver reaches the rider
      estimatedRideTimeMin,    // how long the ride itself will take
      isAvailable: hasDrivers, // true only if nearby drivers exist
    };
  });

  return result || [];
};



/**
 * Estimates ride options for MINO_MOTO vehicle type only.
 * Used when filtering results to show only motorcycle options.
 */
export const estimateMotoOptions = async ({
  distanceKm,
  country,
  pickupLat,
  pickupLng,
}: EstimateRideOptionsProps) => {
  // ── Validation ─────────────────────────────────────────────────────────
  if (!distanceKm || isNaN(Number(distanceKm))) {
    throw new Error('Invalid distanceKm value');
  }
  if (!pickupLat || !pickupLng || isNaN(pickupLat) || isNaN(pickupLng)) {
    throw new Error('Invalid pickup location coordinates');
  }

  distanceKm = Number(distanceKm);

  // ── Fetch fare configuration for the given country ─────────────────────
  const fare = await Fare.findOne({
    country: country.toUpperCase(),
    isActive: true,
  });

  if (!fare) {
    throw new Error('Fare configuration not found for this country');
  }

  // ── Fetch average pickup distance for MINO_MOTO drivers ────────────────
  const { avgDistanceKm, hasDrivers } = await getAveragePickupDistanceKm(
    pickupLat,
    pickupLng,
    'MINO_MOTO'
  );

  const speed = AVERAGE_SPEED_KMH['MINO_MOTO'];

  // ── Fare calculation ───────────────────────────────────────────────────
  let estimatedFare =
    fare.minoMoto.baseFee +
    fare.minoMoto.bookingFee +
    fare.minoMoto.ratePerKm * distanceKm;

  // Apply minimum fare if calculated fare is too low
  if (estimatedFare < fare.minoMoto.minimumFare) {
    estimatedFare = fare.minoMoto.minimumFare;
  }

  // Add surcharge if enabled
  let totalFare = estimatedFare;
  if (fare.surcharge?.enabled) {
    totalFare += fare.surcharge.value;
  }

  // Add waiting charge for the full grace period if enabled
  if (fare.waitingCharge?.enabled) {
    totalFare += fare.waitingCharge.rate * fare.waitingCharge.gracePeriod;
  }

  // Calculate platform commission and driver earnings
  const adminCommission = (totalFare * fare.platformCommissionPercentage) / 100;
  const driverEarning = totalFare - adminCommission;

  // Time for the driver to reach the pickup location
  const estimatedArrivalTimeMin = Math.ceil((avgDistanceKm / speed) * 60);

  // Time for the ride from pickup to destination
  const estimatedRideTimeMin = Math.ceil((distanceKm / speed) * 60);

  return {
    vehicleType: 'MINO_MOTO' as TVehicleType,
    estimatedFare: Math.round(estimatedFare),
    totalFare: Math.round(totalFare),
    driverEarning: Math.round(driverEarning),
    adminCommission: Math.round(adminCommission),
    estimatedArrivalTimeMin, // how long until the driver reaches the rider
    estimatedRideTimeMin,    // how long the ride itself will take
    isAvailable: hasDrivers, // true only if nearby MINO_MOTO drivers exist
  };
};
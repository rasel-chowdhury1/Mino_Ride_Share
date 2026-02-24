import { Driver } from "../modules/driver/driver.model";
import { Fare } from "../modules/fare/fare.model";


const VEHICLE_MAP = {
  MINO_GO: 'car',
  MINO_COMFORT: 'car',
  MINO_XL: 'car',
  MINO_MOTO: 'motorcycle',
};

export const estimateRideOptions = async ({
  pickupLocation,
  distanceKm,
  country,
}: {
  pickupLocation: any;
  distanceKm: number;
  country: string;
}) => {
  const fare = await Fare.findOne({ country, isActive: true });
  if (!fare) throw new Error('Fare config not found');

  const results = [];

  const vehicleConfigs = [
    { key: 'MINO_GO', fare: fare.minoGo },
    { key: 'MINO_COMFORT', fare: fare.minoGo }, // same pricing as Go
    { key: 'MINO_XL', fare: fare.minoXL },
    { key: 'MINO_MOTO', fare: fare.minoMoto },
  ];

  for (const vehicle of vehicleConfigs) {
    const drivers = await Driver.countDocuments({
      country,
      approvalStatus: 'verified',
      isOnline: true,
      isOnRide: false,
      driverType: VEHICLE_MAP[vehicle.key],
      currentLocation: {
        $near: {
          $geometry: pickupLocation,
          $maxDistance: 5000,
        },
      },
    });

    let estimatedFare =
      vehicle.fare.baseFee +
      vehicle.fare.bookingFee +
      vehicle.fare.ratePerKm * distanceKm;

    if (estimatedFare < vehicle.fare.minimumFare) {
      estimatedFare = vehicle.fare.minimumFare;
    }

    results.push({
      vehicleCategory: vehicle.key,
      estimatedFare: Math.round(estimatedFare),
      availableDrivers: drivers,
      estimatedArrivalTime: drivers > 0 ? Math.floor(Math.random() * 3) + 3 : null,
    });
  }

  return results;
};
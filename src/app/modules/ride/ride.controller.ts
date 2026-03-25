import { Request, Response } from 'express';
import { RideService } from './ride.service';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { estimateMotoOptions, estimateRideOptions } from './ride.utils';

const createRide = catchAsync(async (req: Request, res: Response) => {
  const {userId, country} = req.user;
  
  req.body.passenger = userId;
  req.body.country = country;
  const result = await RideService.createRide(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride created successfully',
    data: result,
  });
});


const driverAcceptRide = catchAsync(async (req: Request, res: Response) => {

  const { driverProfileId } = req.user;
  const { rideId } = req.params;
  const { lat, lng } = req.body;

  const result = await RideService.driverAcceptRide(
    rideId,
    driverProfileId,
    lat !== undefined ? Number(lat) : undefined,
    lng !== undefined ? Number(lng) : undefined,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride accepted successfully',
    data: result,
  });

})

const updateRideStatus = catchAsync(async (req: Request, res: Response) => {

  const {rideId} = req.params;
  const {status} = req.body;
  const result = await RideService.updateRideStatus(rideId, status);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride status updated successfully',
    data: result,
  });

})


const getRideEstimates = catchAsync(async (req, res) => {
    const { distanceKm, pickupLat, pickupLng} = req.body;
    const country = req.user?.country;


    console.log("country", country);
  const data = await estimateRideOptions({distanceKm, country, pickupLat, pickupLng });

  console.log({data});  

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride estimates retrieved',
    data: data,
  });
});

const getMotorcycleEstimates = catchAsync(async (req, res) => {
    const { distanceKm, pickupLat, pickupLng} = req.body;
    const country = req.user?.country;

  const data = await estimateMotoOptions({distanceKm, country, pickupLat, pickupLng });

  console.log({data});  

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Motorcycle estimates retrieved',
    data: data,
  });
});

const getPassengerRides = catchAsync(async (req: Request, res: Response) => {
  const {userId} = req.user;
  const result = await RideService.getPassengerRides(
    userId,
    req.query
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Passenger rides retrieved',
    meta: result.meta,
    data: result.result,
  });
});

const getDriverRides = catchAsync(async (req: Request, res: Response) => {

  const {userId, driverProfileId} = req.user;

  const result = await RideService.getDriverRides(
    driverProfileId,
    req.query
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver rides retrieved',
    meta: result.meta,
    data: result.result,
  });
});


const getRidesByStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.params;
  const role = req.user.role as 'passenger' | 'driver';
  const id   = role === 'driver' ? req.user.driverProfileId : req.user.userId;

  const result = await RideService.getRidesByStatus(
    id,
    role,
    status as 'completed' | 'cancelled' | 'upcoming',
    req.query,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `${role} ${status} rides retrieved`,
    meta: result.meta,
    data: result.result,
  });
});

const adminGetAllRides = catchAsync(async (req: Request, res: Response) => {
  const result = await RideService.adminGetAllRides(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All rides retrieved',
    meta: result.meta,
    data: result.result,
  });
});

// GET nearest rides for driver
const getNearestRides = catchAsync(async (req: Request, res: Response) => {
  const { longitude, latitude, maxDistance } = req.query;

  if (!longitude || !latitude) {
    throw new Error('Driver location required');
  }

  const rides = await RideService.getNearestRides({
    driverLocation: [Number(longitude), Number(latitude)],
    maxDistanceMeters: maxDistance ? Number(maxDistance) : undefined,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Nearest rides fetched successfully',
    data: rides,
  });
});


const getRecentRides = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;

  if (!userId) {
    throw new Error('User ID is required');
  }

  const data = await RideService.getRecentRides(
    userId,
    (role as 'passenger' | 'driver') ?? 'passenger',
    req.query as Record<string, unknown>,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recent rides fetched successfully',
    data: data.result,
    meta: data.meta,
  });
});


const endRide = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;
  const { rideId } = req.params;
  const { address, coordinates } = req.body; // { address: string, coordinates: [lng, lat] }

  const dropoffLocation = {
    address,
    location: {
      type: 'Point' as const,
      coordinates: coordinates as [number, number],
    },
  };

  const result = await RideService.endRide(rideId, driverProfileId, dropoffLocation);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride ended successfully',
    data: result,
  });
});

const confirmDropoff = catchAsync(async (req: Request, res: Response) => {
  const { driverProfileId } = req.user;
  const { rideId } = req.params;

  const result = await RideService.confirmDropoff(rideId, driverProfileId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Dropoff confirmed successfully',
    data: result,
  });
});

const payRide = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { rideId } = req.params;
  const { tip } = req.body; // optional tip amount

  const result = await RideService.payRide(rideId, userId, tip ?? 0);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payment successful',
    data: result,
  });
});

const submitRideReview = catchAsync(async (req: Request, res: Response) => {
  const { rideId } = req.params;
  const { role }   = req.user;
  const { rating, comment } = req.body;

  const result = await RideService.submitRideReview(
    rideId,
    role as 'passenger' | 'driver',
    { rating, comment },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Review submitted successfully',
    data: result,
  });
});

export const RideController = {
  createRide,
  getMotorcycleEstimates,
  getRideEstimates,
  getPassengerRides,
  getDriverRides,
  getRidesByStatus,
  submitRideReview,
  driverAcceptRide,
  updateRideStatus,
  endRide,
  confirmDropoff,
  payRide,
  adminGetAllRides,
  getNearestRides,
  getRecentRides,
};
import { Request, Response } from 'express';
import { RideService } from './ride.service';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { estimateRideOptions } from '../../utils/rideEstimate.service';

const createRide = catchAsync(async (req: Request, res: Response) => {
  const result = await RideService.createRide(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride created successfully',
    data: result,
  });
});


const getRideEstimates = catchAsync(async (req, res) => {
  const user = req.user;
  const { pickupLocation, dropoffLocation } = req.body;

  // distance calculation (replace later with Google Maps)
  const distanceKm = 5.2;

  const data = await estimateRideOptions({
    pickupLocation,
    distanceKm,
    country: user.country,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride estimates retrieved',
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

  const {userId} = req.user;

  const result = await RideService.getDriverRides(
    req.user.driverProfileId,
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

const updateRideStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await RideService.updateRideStatus(
    req.params.id,
    req.body.status,
    req.body
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride status updated',
    data: result,
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

export const RideController = {
  createRide,
  getRideEstimates,
  getPassengerRides,
  getDriverRides,
  updateRideStatus,
  adminGetAllRides,
};
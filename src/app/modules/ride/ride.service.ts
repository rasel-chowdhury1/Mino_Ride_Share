import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { IRide } from './ride.interface';
import { Ride } from './ride.model';

const createRide = async (payload: IRide) => {
  return await Ride.create(payload);
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

const updateRideStatus = async (
  rideId: string,
  status: string,
  payload: Partial<IRide> = {}
) => {
  const ride = await Ride.findByIdAndUpdate(
    rideId,
    { status, ...payload },
    { new: true }
  );

  if (!ride) {
    throw new AppError(404, 'Ride not found');
  }

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

export const RideService = {
  createRide,
  getPassengerRides,
  getDriverRides,
  updateRideStatus,
  adminGetAllRides,
};
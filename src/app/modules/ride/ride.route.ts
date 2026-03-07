import { Router } from 'express';
import { RideController } from './ride.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';

const router = Router();

/** Passenger */
router.post(
    '/create', 
    auth(USER_ROLE.PASSENGER), 
    RideController.createRide
)

.post(
  '/estimate',
  auth(USER_ROLE.PASSENGER),
  RideController.getRideEstimates
)

.post(
  '/motorcycle-estimate',
  auth(USER_ROLE.PASSENGER),
  RideController.getMotorcycleEstimates
)

.post(
  "/:rideId/accept",
  auth(USER_ROLE.DRIVER),
  RideController.driverAcceptRide
)

.get(
  '/passenger',
  auth(USER_ROLE.PASSENGER),
  RideController.getPassengerRides
)

/** Driver */
.get(
    '/driver', 
    auth(USER_ROLE.DRIVER), 
    RideController.getDriverRides
)

.get(
  "/nearest",
  auth(USER_ROLE.DRIVER),
  RideController.getNearestRides
)

.get(
  "/recent",
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  RideController.getRecentRides
)

.patch(
  '/:id/status',
  auth(USER_ROLE.DRIVER),
  RideController.updateRideStatus
)

/** Admin */
.get(
    '/admin', 
    auth(USER_ROLE.ADMIN), 
    RideController.adminGetAllRides
);

export const RideRoutes = router;
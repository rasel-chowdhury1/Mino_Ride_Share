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

.get(
  '/byStatus/:status',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  RideController.getRidesByStatus
)

/** Driver */
.get(
    '/driver',
    auth(USER_ROLE.DRIVER),
    RideController.getDriverRides
)

.get(
  '/driver/:status',
  auth(USER_ROLE.DRIVER),
  RideController.getRidesByStatus
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


.post(
  '/review/:rideId',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  RideController.submitRideReview
)

.patch(
  '/end/:rideId',
  auth(USER_ROLE.DRIVER),
  RideController.endRide
)

.patch(
  '/confirm-dropoff/:rideId',
  auth(USER_ROLE.DRIVER),
  RideController.confirmDropoff
)

.patch(
  '/pay/:rideId',
  auth(USER_ROLE.PASSENGER),
  RideController.payRide
)

.patch(
  '/status/:id',
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
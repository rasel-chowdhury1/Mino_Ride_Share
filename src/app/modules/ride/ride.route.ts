import { Router } from 'express';
import { RideController } from './ride.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';

const router = Router();

/** Passenger */
router.post(
    '/', 
    auth(USER_ROLE.PASSENGER), 
    RideController.createRide
)

.get(
  '/estimate',
  auth('passenger'),
  RideController.getRideEstimates
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
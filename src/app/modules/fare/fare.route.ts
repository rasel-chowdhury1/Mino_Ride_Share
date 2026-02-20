import { Router } from 'express';
import { FareController } from './fare.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';

const router = Router();

router.post(
  '/create',
  auth(USER_ROLE.ADMIN),
  FareController.createFare
);

router.get(
  '/',
  auth(USER_ROLE.ADMIN),
  FareController.getAllFares
);

router.get(
  '/:country',
  auth(USER_ROLE.ADMIN),
  FareController.getFareByCountry
);

router.patch(
  '/update/:id',
  auth(USER_ROLE.ADMIN),
  FareController.updateFare
);

export const FareRoutes = router;

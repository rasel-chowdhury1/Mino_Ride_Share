import { Router } from "express";
import auth from "../../middleware/auth";
import { USER_ROLE } from "../user/user.constants";
import { DriverController } from "./driver.controller";


const router = Router();

router.patch(
  '/status/toggle',
  auth(USER_ROLE.DRIVER),
  DriverController.toggleOnlineStatus
);

router.get(
  '/earnings',
  auth(USER_ROLE.DRIVER),
  DriverController.getEarnings
);

router.get(
  '/stats',
  auth(USER_ROLE.DRIVER),
  DriverController.getDriverStats
);

export const DriverRoutes = router;


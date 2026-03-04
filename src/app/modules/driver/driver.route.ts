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

export const DriverRoutes = router;


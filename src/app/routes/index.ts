import { Router } from "express";
import { userRoutes } from "../modules/user/user.route";
import { authRoutes } from "../modules/auth/auth.route";
import { otpRoutes } from "../modules/otp/otp.routes";
import { settingsRoutes } from "../modules/setting/setting.route";
import { notificationRoutes } from "../modules/notifications/notifications.route";
import { FareRoutes } from "../modules/fare/fare.route";
import { PromoRoutes } from "../modules/promo/promo.route";
import { FeedbackRoutes } from "../modules/feedback/feedback.route";
import { RideRoutes } from "../modules/ride/ride.route";
import { DriverRoutes } from "../modules/driver/driver.route";
import { ReportRoutes } from "../modules/report/report.route";
import { PaymentRoutes } from "../modules/payment/payment.route";
import { MessageRoutes } from "../modules/message/message.route";
import { DashboardRoutes } from "../modules/dashboard/dashboard.route";

const router = Router();

const moduleRoutes = [
  {
    path: '/users',
    route: userRoutes,
  },
  {
    path: '/drivers',
    route: DriverRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: "/otp",
    route: otpRoutes
  },
  {
    path: "/settings",
    route: settingsRoutes
  },
  {
    path: "/fare",
    route: FareRoutes
  },
  {
    path: "/promo",
    route: PromoRoutes
  },
  {
    path: "/ride",
    route: RideRoutes
  },
  {
    path: "/feedback",
    route: FeedbackRoutes
  },
  {
     path: "/notifications",
     route: notificationRoutes
  },
  {
    path: "/report",
    route: ReportRoutes,
  },
  {
    path: "/payment",
    route: PaymentRoutes,
  },
  {
    path: "/message",
    route: MessageRoutes,
  },
  {
    path: "/dashboard",
    route: DashboardRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
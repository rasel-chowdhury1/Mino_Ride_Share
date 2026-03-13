import { Router } from 'express';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import { MessageController } from './message.controller';

const router = Router();

/** Get chat history for a ride */
router.get(
  '/ride/:rideId',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  MessageController.getRideMessages,
)

/** Get unread message count for a ride */
.get(
  '/unread/:rideId',
  auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER),
  MessageController.getUnreadCount,
);

export const MessageRoutes = router;

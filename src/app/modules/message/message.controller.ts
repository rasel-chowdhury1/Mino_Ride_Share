import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { MessageService } from './message.service';

const getRideMessages = catchAsync(async (req: Request, res: Response) => {
  const { rideId } = req.params;
  const { userId } = req.user;

  const result = await MessageService.getRideMessages(rideId, userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Messages retrieved successfully',
    data: result,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const { rideId } = req.params;
  const { userId } = req.user;

  const count = await MessageService.getUnreadCount(rideId, userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Unread count retrieved',
    data: { unreadCount: count },
  });
});

export const MessageController = {
  getRideMessages,
  getUnreadCount,
};

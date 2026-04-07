import { Request, Response } from 'express';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import { notificationService } from './notifications.service';

const createNotification = catchAsync(async (req: Request, res: Response) => {
  const senderId = req.user.userId;
  const { receiverId, message, type } = req.body;

  const result = await notificationService.createNotification({
    userId: senderId,
    receiverId,
    message,
    type,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Notification created successfully!',
    data: result,
  });
});

const getAllNotifications = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.getAllNotifications(req.query);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'All notifications fetched successfully!',
    data: result,
  });
});

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const receiverId = req.user.userId;
  const result = await notificationService.getMyNotifications(receiverId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'My notifications fetched successfully!',
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await notificationService.markAsRead(id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Notification marked as read!',
    data: result,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const receiverId = req.user.userId;
  const result = await notificationService.markAllAsRead(receiverId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'All notifications marked as read!',
    data: result,
  });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await notificationService.deleteNotification(id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Notification deleted successfully!',
    data: result,
  });
});

export const notificationController = {
  createNotification,
  getAllNotifications,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

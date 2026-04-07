import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import Notification from './notifications.model';

interface ICreateNotificationProps {
  userId: string; // Sender User ID
  receiverId: string; // Receiver User ID
  message: {
    fullName?: string;
    image?: string;
    text: string;
    photos?: string[];
  };
  type:
    | 'technicianPendingApproval'
    | 'serviceOrderPending'
    | 'serviceOrderAccepted'
    | 'technicianVerified'
    | 'technicianDeclined'
    | 'serviceOrderCompleted';
}

const createNotification = async ({
  userId,
  receiverId,
  message,
  type,
}: ICreateNotificationProps) => {
  const newNotification = await Notification.create({
    userId,
    receiverId,
    message,
    type,
  });

  return newNotification;
};

const getAllNotifications = async (query: Record<string, unknown>) => {
  const notifications = await Notification.find(query)
    .populate('userId receiverId', 'fullName image')
    .sort({ createdAt: -1 });

  return notifications;
};

const getMyNotifications = async (receiverId: string) => {
  const notifications = await Notification.find({ receiverId })
    .populate('userId receiverId', 'fullName image')
    .sort({ createdAt: -1 });

  return notifications;
};

const markAsRead = async (id: string) => {
  const notification = await Notification.findByIdAndUpdate(
    id,
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found');
  }

  return notification;
};

const markAllAsRead = async (receiverId: string) => {
  await Notification.updateMany(
    { receiverId, isRead: false },
    { $set: { isRead: true } }
  );
  return { message: 'All notifications marked as read' };
};

const deleteNotification = async (id: string) => {
  const notification = await Notification.findByIdAndDelete(id);

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found');
  }

  return { message: 'Notification deleted successfully' };
};

export const notificationService = {
  createNotification,
  getAllNotifications,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

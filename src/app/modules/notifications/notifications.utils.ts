import { Types } from 'mongoose';
import Notification from './notifications.model';
import { INotification } from './notifications.interface';
import { Driver } from '../driver/driver.model';

type TNotificationInput = {
  senderId: string;
  receiverId: string;
  text: string;
  senderName?: string;
  senderImage?: string;
  type: INotification['type'];
};

/**
 * Save a single in-app notification to the DB.
 * Fire-and-forget safe — never throws.
 */
export const saveNotification = async (input: TNotificationInput): Promise<void> => {
  try {
    await Notification.create({
      userId:     new Types.ObjectId(input.senderId),
      receiverId: new Types.ObjectId(input.receiverId),
      message: {
        fullName: input.senderName  ?? '',
        image:    input.senderImage ?? '',
        text:     input.text,
        photos:   [],
      },
      type: input.type,
    });
  } catch (err) {
    console.error('saveNotification error:', err);
  }
};

/**
 * Save in-app notifications to nearby drivers given their driverProfileIds.
 * Resolves driverProfileId → userId internally.
 * Fire-and-forget safe — never throws.
 */
export const saveNotificationToDriversByProfileId = async (
  driverProfileIds: string[],
  input: Omit<TNotificationInput, 'receiverId'>,
): Promise<void> => {
  if (!driverProfileIds.length) return;
  try {
    const drivers = await Driver.find({ _id: { $in: driverProfileIds } })
      .select('userId')
      .lean();

    const userIds = drivers.map((d) => d.userId?.toString()).filter((id): id is string => !!id);
    await saveNotificationToMany(userIds, input);
  } catch (err) {
    console.error('saveNotificationToDriversByProfileId error:', err);
  }
};

/**
 * Save in-app notifications to multiple receivers (e.g. broadcast to nearby drivers).
 * Resolved userId is used as the sender for each doc.
 * Fire-and-forget safe — never throws.
 */
export const saveNotificationToMany = async (
  receiverIds: string[],
  input: Omit<TNotificationInput, 'receiverId'>,
): Promise<void> => {
  if (!receiverIds.length) return;
  try {
    const docs = receiverIds.map((receiverId) => ({
      userId:     new Types.ObjectId(input.senderId),
      receiverId: new Types.ObjectId(receiverId),
      message: {
        fullName: input.senderName  ?? '',
        image:    input.senderImage ?? '',
        text:     input.text,
        photos:   [],
      },
      type: input.type,
    }));
    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('saveNotificationToMany error:', err);
  }
};

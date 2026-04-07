
import admin from "firebase-admin";
import { getMessaging, Message, MulticastMessage } from "firebase-admin/messaging";
import { User } from "../modules/user/user.model";
import { Driver } from "../modules/driver/driver.model";
// Use `require` to load the JSON file
const serviceAccount = require("../../../googleFirebaseAdmin.json"); // Adjust the path accordingly

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
// Function to send notification to a user
export const sendNotificationByFcmToken = async (receiverId: any, textMessage: string,  titleName?: string,): Promise<void> => {
  

  console.log({receiverId,textMessage})
    // Fetch the user by ID
    const findUser = await User.findOne({ _id: receiverId });

    console.log({findUser})

    // If the user is not found, log and return early
    if (!findUser) {
      console.log(`User with id ${receiverId} not found`);
      return;
    }

    const { fcmToken } = findUser;

    // Ensure the FCM token is valid
    if (!fcmToken?.trim()) {
      console.log(`No valid FCM token found for user: ${receiverId}`);
      return;
    }

    // Construct the notification message
    const message: Message = {
      notification: {
        title: titleName || "Supporto Pianofesta", //Pianofesta Support // Set title dynamically with user's name or default to "Admin"
        body: textMessage, // Set the body of the notification
      },
      token: fcmToken, // Use the user's FCM token to send the message
    };

    getMessaging()
      .send(message)
      .then((response) => {
        console.log("Successfully sent message:", response);
        console.log(response);
      })
      .catch((error) => {
        console.log("Error sending message:", error);
      });
  

};

/**
 * Send FCM push notification to all drivers matching the given driverProfileIds.
 * Looks up userId via Driver model, then fetches each user's fcmToken.
 * Fire-and-forget — errors are logged, never thrown.
 */
export const sendFcmToNearbyDrivers = async (
  driverProfileIds: string[],
  title: string,
  body: string,
): Promise<void> => {
  if (!driverProfileIds.length) return;

  try {
    // Resolve driverProfileId → userId
    const drivers = await Driver.find({ _id: { $in: driverProfileIds } })
      .select('userId')
      .lean();

    const userIds = drivers.map((d) => d.userId?.toString()).filter(Boolean);
    if (!userIds.length) return;

    // Fetch FCM tokens
    const users = await User.find({ _id: { $in: userIds } })
      .select('fcmToken')
      .lean();

    const tokens = users.map((u) => u.fcmToken).filter((t): t is string => !!t?.trim());
    if (!tokens.length) return;

    const multicast: MulticastMessage = {
      notification: { title, body },
      tokens,
    };

    const result = await getMessaging().sendEachForMulticast(multicast);
    console.log(`sendFcmToNearbyDrivers: ${result.successCount}/${tokens.length} sent`);
  } catch (err) {
    console.error('sendFcmToNearbyDrivers error:', err);
  }
};

// Function to send notification to a user
export const sendReminderNotification = async (receiverId: any, title: string, textMessage: string): Promise<void> => {

    // Fetch the user by ID
    const findUser = await User.findOne({ _id: receiverId });

    console.log({findUser})

    // If the user is not found, log and return early
    if (!findUser) {
      console.log(`User with id ${receiverId} not found`);
      return;
    }

    const { fcmToken } = findUser;

    // Ensure the FCM token is valid
    if (!fcmToken?.trim()) {
      console.log(`No valid FCM token found for user: ${receiverId}`);
      return;
    }

    // Construct the notification message
    const message: Message = {
      notification: {
        title: "Pianofesta Support", // Set title dynamically with user's name or default to "Admin"
        body: textMessage, // Set the body of the notification
      },
      token: fcmToken, // Use the user's FCM token to send the message
    };

    getMessaging()
      .send(message)
      .then((response) => {
        console.log("Successfully sent message:", response);
        console.log(response);
      })
      .catch((error) => {
        console.log("Error sending message:", error);
      });
  

};

import config from "../config";
import { sendEmail } from "./mailSender";

interface BookingNotificationEmailParams {
  sentTo: string;       // user email
  subject: string;      // email subject
  userName: string;     // sender name (service provider)
  messageText: string;  // main text
}

interface OtpSendEmailParams {
  sentTo: string;
  subject: string;
  name: string;
  otp: string | number;
  expiredAt: string;
}



const logoUrl = config.logo_url || 'https://res.cloudinary.com/dns84qf2p/image/upload/v1770783068/mobile_repair_pf3soi.png';
const primaryColor = config.primary_color || '#081F2D';
const supportEmail =
  config.support_email || `support@${config.project_name}.com`;

const otpSendEmail = async ({
  sentTo,
  subject,
  name,
  otp,
  expiredAt,
}: OtpSendEmailParams): Promise<void> => {
  const emailBody = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">

    <!-- Header -->
    <div style="background-color: ${primaryColor}; text-align: center; padding: 24px;">
      ${
        logoUrl
          ? `<img src="${logoUrl}" alt="${config.project_name} Logo" style="max-width: 150px; margin-bottom: 12px;" />`
          : ''
      }
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">
        One-Time Password (OTP)
      </h1>
    </div>

    <!-- Body -->
    <div style="padding: 24px; color: #333333;">
      <p>Hello <strong>${name}</strong>,</p>

      <br/>
      <p>
        Use the following One-Time Password (OTP) to complete your verification.
        This code is valid for a limited time.
      </p>

      <div style="
        background-color: #f4f6fb;
        border: 1px dashed ${primaryColor};
        padding: 20px;
        text-align: center;
        border-radius: 6px;
        margin: 24px 0;
      ">
        <p style="margin: 0; font-size: 14px; color: #555;">Your OTP Code</p>
        <p style="
          margin: 8px 0 0;
          font-size: 28px;
          font-weight: bold;
          color: ${primaryColor};
          letter-spacing: 4px;
        ">
          ${otp}
        </p>
      </div>

      <p style="font-size: 14px; color: #666;">
        This OTP will expire on:<br />
        <strong>${expiredAt.toLocaleString()}</strong>
      </p>

      <p style="margin-top: 24px; font-size: 14px;">
        If you didn’t request this code, please contact us at
        <a href="mailto:${supportEmail}" style="color: ${primaryColor}; text-decoration: none;">
          ${supportEmail}
        </a>.
      </p>

      <p style="margin-top: 32px;">
        Regards,<br />
        <strong>${config.project_name} Team</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f5; text-align: center; padding: 14px; font-size: 12px; color: #777;">
      © ${new Date().getFullYear()} ${config.project_name}. All rights reserved.
    </div>
  </div>
  `;

  await sendEmail(sentTo, subject, emailBody);
};

const sendNotificationEmail = async ({
  sentTo,
  subject,
  userName,
  messageText,
}: BookingNotificationEmailParams): Promise<void> => {
  const emailBody = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">

    <!-- Header -->
    <div style="background-color: ${primaryColor}; text-align: center; padding: 20px;">
      ${
        logoUrl
          ? `<img src="${logoUrl}" alt="${config.project_name} Logo" style="max-width: 140px; margin-bottom: 10px;" />`
          : ''
      }
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">
        Notification
      </h1>
    </div>

    <!-- Body -->
    <div style="padding: 24px; color: #333333;">
      <p>Hello <strong>${userName}</strong>,</p>

      <p style="font-size: 16px; line-height: 1.6;">
        ${messageText}
      </p>

      <p style="margin-top: 24px; font-size: 14px; color: #666;">
        If you have any questions, feel free to contact us at
        <a href="mailto:${supportEmail}" style="color: ${primaryColor}; text-decoration: none;">
          ${supportEmail}
        </a>.
      </p>

      <p style="margin-top: 32px;">
        Best regards,<br />
        <strong>${config.project_name} Team</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f5; text-align: center; padding: 14px; font-size: 12px; color: #777;">
      © ${new Date().getFullYear()} ${config.project_name}. All rights reserved.
    </div>
  </div>
  `;

  await sendEmail(sentTo, subject, emailBody);
};

export { otpSendEmail, sendNotificationEmail };

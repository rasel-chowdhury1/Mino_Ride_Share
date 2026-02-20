import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join((process.cwd(), '.env')) });

const aws = {
  accessKeyId: process.env.S3_BUCKET_ACCESS_KEY,
  secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_BUCKET_NAME,
};

const stripe = {
  stripe_api_key: process.env.STRIPE_API_KEY,
  stripe_api_secret: process.env.STRIPE_API_SECRET,
};


const smtp = {
  host: process.env.NODEMAILER_HOST,
  port: process.env.NODEMAILER_PORT,
  user: process.env.NODEMAILER_HOST_EMAIL,
  pass: process.env.NODEMAILER_HOST_PASS,
  fromName: process.env.NODEMAILER_FROM_NAME,
}

export default {
  NODE_ENV: process.env.NODE_ENV,
  project_name: process.env.PROJECT_NAME,
  port: process.env.PORT,
  ip: process.env.IP,
  database_url: process.env.DATABASE_URL,
  server_url: process.env.SERVER_URL,
  client_Url: process.env.CLIENT_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
  admin_email: process.env.ADMIN_EMAIL,
  admin_password: process.env.ADMIN_PASSWORD,
  admin_phone: process.env.ADMIN_PHONE,
  default_superadmin_pass: process.env.DEFAULT_SUPERADMIN_PASS,
  nodemailer_host_email: process.env.NODEMAILER_HOST_EMAIL,
  nodemailer_host_pass: process.env.NODEMAILER_HOST_PASS,
  otp_expire_time: process.env.OTP_EXPIRE_TIME,
  otp_token_expire_time: process.env.OTP_TOKEN_EXPIRE_TIME,
  socket_port: process.env.SOCKET_PORT,
  stripe_secret: process.env.STRIPE_API_SECRET,
  stripe_key: process.env.STRIPE_API_KEY,
  logo_url: process.env.LOGO_URL,
  primary_color: process.env.PRIMARY_COLOR,
  support_email: process.env.SUPPORT_EMAIL,
  aws,
  stripe,
  smtp
};

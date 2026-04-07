export const USER_ROLE = {
  PASSENGER: 'passenger',
  DRIVER: 'driver',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const;

export const gender = ['Male', 'Female', 'Others'] as const;
export const Role = Object.values(USER_ROLE);

export enum Login_With {
  google = 'google',
  apple = 'apple',
  facebook = 'facebook',
  credentials = 'credentials',
}

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
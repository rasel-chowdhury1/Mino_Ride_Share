import config from "../../config";
import { createToken } from "../../utils/tokenManage";
import { TUser } from "./user.interface";

// ── shared token builder ──────────────────────────────────────────────────────
export const buildAccessToken = (u: TUser & { _id: any }) =>
  createToken({
    payload: {
      userId:                   u._id.toString(),
      name:                     u.name              || '',
      email:                    u.email,
      role:                     u.role,
      adminVerified:            u.adminVerified,
      profileImage:             u.profileImage      || '',
      homeAddress:              u.homeAddress       || '',
      isDriverProfileCompleted: u.isDriverProfileCompleted,
    },
    access_secret: config.jwt_access_secret as string,
    expity_time:   config.jwt_access_expires_in as string,
  });

// ── shared user field extractor ───────────────────────────────────────────────
export const buildUserUpdate = (p: Partial<TUser>) => ({
  ...(p.name        !== undefined && { name:        p.name }),
  ...(p.gender      !== undefined && { gender:      p.gender }),
  ...(p.dateOfBirth !== undefined && { dateOfBirth: p.dateOfBirth }),
  ...(p.profileImage              && { profileImage: p.profileImage }),
  ...(p.homeAddress               && { homeAddress:  p.homeAddress }),
});

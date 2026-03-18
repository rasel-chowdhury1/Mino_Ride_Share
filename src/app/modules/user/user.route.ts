import { Router } from 'express';
import auth from '../../middleware/auth';
import fileUpload from '../../middleware/fileUpload';
import parseData from '../../middleware/parseData';
import validateRequest from '../../middleware/validateRequest';
import { verifyOtpValidations } from '../otp/otp.validation';
import { userController } from './user.controller';
import { userValidation } from './user.validation';
import { USER_ROLE } from './user.constants';
const upload = fileUpload('./public/uploads/profile');

export const userRoutes = Router();

userRoutes
  .post(
    '/create',
    validateRequest(userValidation?.userValidationSchema),
    userController.createUser,
  )

  .post(
    '/create-user-verify-otp',
    validateRequest(verifyOtpValidations.verifyOtpZodSchema),
    userController.userCreateVarification,
  )


  
  .post(
    "/create-superadmin",
    auth(USER_ROLE.ADMIN),
    userController.createSuperAdmin
  )


  .get(
    '/my-profile',
    auth(
      USER_ROLE.PASSENGER, USER_ROLE.DRIVER, USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN,
    ),
    userController.getMyProfile,
  )

  .get(
    '/admin/my-profile',
    auth(
      USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN,
    ),
    userController.getAdminProfile,
  )

  .get(
    '/admin-profile',
    auth(
      'admin'
    ),
    userController.getAdminProfile,
  )

  .get('/all-users', auth("admin"), userController.getAllUsers)

  .get('/all-passengers', auth(USER_ROLE.ADMIN), userController.getAllPassengers)

  .get('/all-approved-drivers', auth(USER_ROLE.ADMIN), userController.getAllApprovedDrivers)

  .get('/all-request-drivers', auth(USER_ROLE.ADMIN), userController.getAllRequestDrivers)

  .get(
    "/super_admins",
    auth(USER_ROLE.ADMIN),
    userController.getAllSuperAdmins
  )

 

  .patch(
    '/update-my-profile',
    auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER, USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'license', maxCount: 1 },
      { name: 'vehicle', maxCount: 5 },
      { name: 'registration', maxCount: 1 },
      { name: 'certificate', maxCount: 1 },
    ]),
    parseData(),
    userController.updateMyProfile,
  )

  .patch(
    '/update-super-admin-profile/:superAdminId',
    auth(USER_ROLE.ADMIN),
    userController.updateSuperAdminByAdmin
  )

  
  .patch(
    '/block/:id',
    auth('admin'),
    userController.blockedUser,
  )

  .patch(
    '/approve-driver/:id',
    auth(USER_ROLE.ADMIN),
    userController.approveDriver,
  )

  .patch(
    '/reject-driver/:id',
    auth(USER_ROLE.ADMIN),
    userController.rejectDriver,
  )

  .patch(
    '/warn/:id',
    auth(USER_ROLE.ADMIN),
    userController.warnUser,
  )

  .patch(
    '/ban/:id',
    auth(USER_ROLE.ADMIN),
    userController.banUser,
  )

  .patch(
    '/unban/:id',
    auth(USER_ROLE.ADMIN),
    userController.unbanUser,
  )
  
  .delete(
    '/delete-my-account',
    auth('user'
    ),
    userController.deleteMyAccount,
  )

  .delete(
    '/delete-user/:id',
    auth(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
    userController.deletedUserById
  );

// export default userRoutes;

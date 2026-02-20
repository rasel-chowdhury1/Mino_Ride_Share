import { Router } from 'express';
import { PromoController } from './promo.controller';
import { USER_ROLE } from '../user/user.constants';
import auth from '../../middleware/auth';

const router = Router();

/** Admin routes */
router
    .post(
        '/create', 
        auth(USER_ROLE.ADMIN), 
        PromoController.createPromo
    )
    .get(
        '/', 
        auth(USER_ROLE.ADMIN), 
        PromoController.getAllPromos
    )
    .get(
        '/:id', 
        auth(USER_ROLE.ADMIN), 
        PromoController.getPromoById
    )
    .patch(
        '/update/:id', 
        auth(USER_ROLE.ADMIN), 
        PromoController.updatePromo
    )
    .delete(
        '/:id', 
        auth(USER_ROLE.ADMIN), 
        PromoController.deletePromo
    )

    /** Passenger routes */
    .get(
        '/public/active',
        auth(USER_ROLE.PASSENGER, USER_ROLE.DRIVER ),
        PromoController.getActivePromosForUser
    );

export const PromoRoutes = router;

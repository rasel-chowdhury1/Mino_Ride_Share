import { Request, Response } from 'express';;
import { PromoService } from './promo.service';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';

const createPromo = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoService.createPromo(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Promo created successfully',
    data: result,
  });
});

const getAllPromos = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoService.getAllPromos(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promos retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getPromoById = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoService.getPromoById(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promo retrieved successfully',
    data: result,
  });
});

const updatePromo = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoService.updatePromo(req.params.id, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promo updated successfully',
    data: result,
  });
});

const deletePromo = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoService.deletePromo(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promo deleted successfully',
    data: result,
  });
});

const getActivePromosForUser = catchAsync(
  async (_req: Request, res: Response) => {
    const result = await PromoService.getActivePromosForUser();

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Active promos retrieved successfully',
      data: result,
    });
  }
);

export const PromoController = {
  createPromo,
  getAllPromos,
  getPromoById,
  updatePromo,
  deletePromo,
  getActivePromosForUser,
};

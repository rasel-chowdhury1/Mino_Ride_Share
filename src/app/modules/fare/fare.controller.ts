import { Request, Response } from 'express';
import { FareService } from './fare.service';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';

const createFare = catchAsync(async (req: Request, res: Response) => {
  const result = await FareService.createFare(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Fare configuration created successfully',
    data: result,
  });
});

const getAllFares = catchAsync(async (req: Request, res: Response) => {
  const result = await FareService.getAllFares(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare configurations retrieved successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getFareByCountry = catchAsync(async (req: Request, res: Response) => {
  const result = await FareService.getFareByCountry(req.params.country);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare configuration retrieved successfully',
    data: result,
  });
});

const updateFare = catchAsync(async (req: Request, res: Response) => {
  const result = await FareService.updateFare(req.params.id, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare configuration updated successfully',
    data: result,
  });
});

const deleteFare = catchAsync(async (req: Request, res: Response) => {
  const result = await FareService.deleteFare(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare configuration deleted successfully',
    data: result,
  });
});

export const FareController = {
  createFare,
  getAllFares,
  getFareByCountry,
  updateFare,
  deleteFare,
};

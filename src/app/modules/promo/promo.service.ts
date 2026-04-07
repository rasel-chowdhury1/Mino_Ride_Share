import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { IPromo } from './promo.interface';
import { Promo } from './promo.model';

const createPromo = async (payload: IPromo) => {
  return await Promo.create(payload);
};

const getAllPromos = async (query: Record<string, unknown>) => {
  const promoQuery = new QueryBuilder(
    Promo.find({ isDeleted: false }),
    query
  )
    .search(['title'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await promoQuery.modelQuery;
  const meta = await promoQuery.countTotal();

  return { meta, result };
};

const getPromoById = async (id: string) => {
  const promo = await Promo.findOne({ _id: id, isDeleted: false });

  if (!promo) {
    throw new AppError(404, 'Promo not found');
  }

  return promo;
};

const updatePromo = async (id: string, payload: Partial<IPromo>) => {
  const promo = await Promo.findOneAndUpdate(
    { _id: id, isDeleted: false },
    payload,
    { new: true, runValidators: true }
  );

  if (!promo) {
    throw new AppError(404, 'Promo not found');
  }

  return promo;
};

const deletePromo = async (id: string) => {
  const promo = await Promo.findOneAndUpdate(
    { _id: id },
    { isDeleted: true, status: 'INACTIVE' },
    { new: true }
  );

  if (!promo) {
    throw new AppError(404, 'Promo not found');
  }

  return promo;
};

const getActivePromosForUser = async () => {
  const today = new Date();

  return Promo.find({
    isDeleted: false,
    status: 'ACTIVE',
    expirationDate: { $gte: today },
  }).sort({ createdAt: -1 });
};

export const PromoService = {
  createPromo,
  getAllPromos,
  getPromoById,
  updatePromo,
  deletePromo,
  getActivePromosForUser,
};

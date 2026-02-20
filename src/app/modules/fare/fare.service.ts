import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { IFare } from './fare.interface';
import { Fare } from './fare.model';

const createFare = async (payload: IFare) => {
  const exists = await Fare.findOne({ country: payload.country });

  if (exists) {
    throw new AppError(400, 'Fare configuration already exists for this country');
  }

  return await Fare.create(payload);
};

const getAllFares = async (query: Record<string, unknown>) => {
  const fareQuery = new QueryBuilder(Fare.find(), query)
    .search(['country'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await fareQuery.modelQuery;
  const meta = await fareQuery.countTotal();

  return { meta, result };
};

const getFareByCountry = async (country: string) => {
  const fare = await Fare.findOne({ country: country.toUpperCase() });

  if (!fare) {
    throw new AppError(404, 'Fare configuration not found');
  }

  return fare;
};

const updateFare = async (id: string, payload: Partial<IFare>) => {
  const updated = await Fare.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw new AppError(404, 'Fare configuration not found');
  }

  return updated;
};

export const FareService = {
  createFare,
  getAllFares,
  getFareByCountry,
  updateFare,
};

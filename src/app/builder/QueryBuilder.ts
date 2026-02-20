

import mongoose, { FilterQuery, Query } from 'mongoose';

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  search(searchableFields: string[]) {
    const searchTerm = this?.query?.searchTerm;
    if (searchTerm) {
      this.modelQuery = this.modelQuery.find({
        $or: searchableFields.map(
          (field) =>
            ({
              [field]: { $regex: searchTerm, $options: 'i' },
            }) as FilterQuery<T>,
        ),
      });
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.query } as Record<string, any>; //copy
    // filtering
    const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields'];

    excludeFields.forEach((el) => delete queryObj[el]);


  // Handle price filter independently
    const minPrice = this.query.minPrice ? parseFloat(this.query.minPrice as string) : undefined;
    const maxPrice = this.query.maxPrice ? parseFloat(this.query.maxPrice as string) : undefined;

    if (!isNaN(minPrice!) || !isNaN(maxPrice!)) {
      queryObj['price'] = {};
      if (!isNaN(minPrice!)) queryObj['price']['$gte'] = minPrice;
      if (!isNaN(maxPrice!)) queryObj['price']['$lte'] = maxPrice;
    }

    delete queryObj.minPrice;
    delete queryObj.maxPrice;


    // Handle category name filter
    if (this.query.categoryName) {

      this.modelQuery = this.modelQuery.find({
        'categoryId.title': { $regex: this.query.categoryName, $options: 'i' },
      });

      delete queryObj.categoryName;
    }

    if (this.query.categoryId) {
      try {
        queryObj['categoryId'] = new mongoose.Types.ObjectId(this.query.categoryId as string);
      } catch {
        console.warn("Invalid categoryId format, skipping filter");
      }
    }

    // Handle condition filter
    if (this.query.condition) {
      queryObj['condition'] = this.query.condition;
    }

    this.modelQuery = this.modelQuery.find(queryObj as FilterQuery<T>);

    return this;
  }

  sort() {
    const sort =
      (this?.query?.sort as string)?.split(',')?.join(' ') || '-createdAt';
    this.modelQuery = this.modelQuery.sort(sort as string);
    return this;
  }

  paginate() {
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query?.limit) || 10;
    const skip = (page - 1) * limit;

    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  fields() {
    const fields =
      (this?.query?.fields as string)?.split(',')?.join(' ') || '-__v';

    this.modelQuery = this.modelQuery.select(fields);
    return this;
  }

  async countTotal() {
    const totalQuery = this.modelQuery.getFilter();
    const total = await this.modelQuery.model.countDocuments(totalQuery);
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query?.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPage,
    };
  }
}

export default QueryBuilder;
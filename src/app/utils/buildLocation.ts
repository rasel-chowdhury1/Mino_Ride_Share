import AppError from "../error/AppError";

export const buildLocation = (longitude?: string, latitude?: string): { type: 'Point'; coordinates: [number, number]; } | undefined => {
  if (longitude === undefined || latitude === undefined) {
    return undefined; // Return null if no coordinates are provided
  }

  // Convert strings to floats
  const lng = parseFloat(longitude);
  const lat = parseFloat(latitude);

  if (isNaN(lng) || isNaN(lat)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid longitude or latitude');
  }

  return {
    type: 'Point',
    coordinates: [lng, lat],
  };
};
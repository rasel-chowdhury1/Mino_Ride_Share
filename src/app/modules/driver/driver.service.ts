import { Driver } from "./driver.model";

const toggleOnlineStatus = async (
  driverProfileId: string,
  isOnline: boolean,
  lat?: number,
  lng?: number
) => {
  // Only verified drivers can go online
  const driver = await Driver.findById(driverProfileId);
  if (!driver) throw new Error('Driver profile not found');

  if (driver.approvalStatus !== 'verified') {
    throw new Error('Only verified drivers can go online');
  }

  // lat/lng is required when going online
  if (isOnline && (!lat || !lng || isNaN(lat) || isNaN(lng))) {
    throw new Error('lat and lng are required when going online');
  }

  const updatePayload: Record<string, unknown> = { isOnline };

  if (isOnline) {
    updatePayload.currentLocation = {
      type: 'Point',
      coordinates: [lng, lat], // MongoDB expects [lng, lat]
    };
  }

  const updatedDriver = await Driver.findByIdAndUpdate(
    driverProfileId,
    updatePayload,
    { new: true }
  ).select('isOnline currentLocation vehicleType approvalStatus');

  return updatedDriver;
};

export const DriverService = { 
    toggleOnlineStatus 
};
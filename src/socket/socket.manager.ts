// ─────────────────────────────────────────────────────────────────────────────
// socket.manager.ts
// Module-level state + exported functions for room management, online-user
// tracking, and emit helpers.
// No business logic lives here — only socket-layer concerns.
// ─────────────────────────────────────────────────────────────────────────────

import { Server as SocketIOServer } from 'socket.io';
import { Driver } from '../app/modules/driver/driver.model';
import { logger } from '../app/utils/logger';
import { getDistanceKm } from '../app/modules/ride/ride.utils';
import { IOnlineDriverEntry, IOnlineUserEntry, RideRequestedPayload, SocketEvents } from './socket.types';

// ─── Module-level state ───────────────────────────────────────────────────────

let _io: SocketIOServer | null = null;

/** userId → entry (all roles) */
const onlineUsers = new Map<string, IOnlineUserEntry>();

/** driverProfileId → entry (drivers only) */
const onlineDrivers = new Map<string, IOnlineDriverEntry>();

console.log("onlineDrivers =>>>> ", onlineDrivers);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function initManager(io: SocketIOServer): void {
  _io = io;
  logger.info('Socket manager initialized');
}

/** True once initManager() has been called. Used for null-safety in services. */
export function isManagerReady(): boolean {
  return _io !== null;
}

// ─── Room name helpers ────────────────────────────────────────────────────────

export const passengerRoom = (userId: string) => `passenger:${userId}`;
export const driverRoom    = (driverProfileId: string) => `driver:${driverProfileId}`;
export const rideRoom      = (rideId: string) => `ride:${rideId}`;

// ─── User / Driver registration ───────────────────────────────────────────────

export function registerUser(user: {
  socketId: string;
  userId: string;
  role: string;
  driverProfileId?: string;
  vehicleType?: string;
}): void {
  const base: IOnlineUserEntry = {
    socketId: user.socketId,
    userId: user.userId,
    role: user.role,
    connectedAt: new Date(),
    lastSeen: new Date(),
  };
  onlineUsers.set(user.userId, base);

  if (user.role === 'driver' && user.driverProfileId) {
    onlineDrivers.set(user.driverProfileId, {
      ...base,
      driverProfileId: user.driverProfileId,
      vehicleType: user.vehicleType,
      isOnRide: false,
    });
  }
}

export function unregisterUser(userId: string, driverProfileId?: string): void {
  onlineUsers.delete(userId);

  if (driverProfileId) {
    onlineDrivers.delete(driverProfileId);
    return;
  }

  // Fallback scan if driverProfileId was not provided
  for (const [key, val] of onlineDrivers.entries()) {
    if (val.userId === userId) {
      onlineDrivers.delete(key);
      break;
    }
  }
}

export function updateUserLastSeen(userId: string): void {
  const entry = onlineUsers.get(userId);
  if (entry) entry.lastSeen = new Date();
}

export function updateDriverLocation(
  driverProfileId: string,
  coordinates: [number, number],
): void {
  const entry = onlineDrivers.get(driverProfileId);
  if (entry) {
    entry.location = coordinates;
    entry.lastSeen = new Date();
  }
}

export function setDriverOnRide(driverProfileId: string, isOnRide: boolean): void {
  const entry = onlineDrivers.get(driverProfileId);
  if (entry) entry.isOnRide = isOnRide;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const isUserOnline   = (userId: string) => onlineUsers.has(userId);
export const isDriverOnline = (driverProfileId: string) => onlineDrivers.has(driverProfileId);

export const getOnlineUserEntry   = (userId: string) => onlineUsers.get(userId);
export const getOnlineDriverEntry = (driverProfileId: string) => onlineDrivers.get(driverProfileId);

export const getOnlineDriverProfileIds = () => Array.from(onlineDrivers.keys());

export function getOnlineUsersSnapshot(): Array<{ userId: string; role: string }> {
  return Array.from(onlineUsers.values()).map((u) => ({ userId: u.userId, role: u.role }));
}

// ─── Room management ──────────────────────────────────────────────────────────

export function joinRideRoom(socketId: string, rideId: string): void {
  _io?.sockets.sockets.get(socketId)?.join(rideRoom(rideId));
}

export function leaveRideRoom(socketId: string, rideId: string): void {
  _io?.sockets.sockets.get(socketId)?.leave(rideRoom(rideId));
}

// ─── Emit helpers ─────────────────────────────────────────────────────────────

function hasRoomSockets(room: string): boolean {
  const sockets = _io?.sockets.adapter.rooms.get(room);
  return sockets !== undefined && sockets.size > 0;
}

/**
 * Emit to a passenger's personal room.
 * Falls back to their direct socket ID if the room is empty.
 * Returns true if the user was reachable, false if offline.
 */
export function emitToPassenger(passengerId: string, event: string, data: unknown): boolean {
  if (!_io) return false;

  const room = passengerRoom(passengerId);

  console.log("passenger room =>>>>> ", room);
  console.log("hasRoomSockets =>>>> ", hasRoomSockets(room));
  console.log("passenger event =>>>> ", event);

  if (hasRoomSockets(room)) {
    _io.to(room).emit(event, data);
    return true;
  }

  const entry = onlineUsers.get(passengerId);
  
  if (entry) {
    _io.to(entry.socketId).emit(event, data);
    return true;
  }

  logger.warn(`emitToPassenger: passenger ${passengerId} is offline`);
  return false;
}

/**
 * Emit to a driver's personal room.
 * Falls back to their direct socket ID if the room is empty.
 */
export function emitToDriver(driverProfileId: string, event: string, data: unknown): boolean {
  if (!_io) return false;

  const room = driverRoom(driverProfileId);

  console.log("room =>>>> ", room);
  console.log("hasRoomSockets =>>>> ", hasRoomSockets(room));
  console.log("driver event =>>>> ", event);

  if (hasRoomSockets(room)) {
    _io.to(room).emit(event, data);
    return true;
  }

  const entry = onlineDrivers.get(driverProfileId);

  if (entry) {
    _io.to(entry.socketId).emit(event, data);
    return true;
  }

  logger.warn(`emitToDriver: driver ${driverProfileId} is offline`);
  return false;
}

/** Emit to all sockets in a ride room (passenger + assigned driver). */
export function emitToRideRoom(rideId: string, event: string, data: unknown): void {
  console.log("emitToRideRoom =>>>> ", rideId, event, data);
  console.log("rideRoom =>>> ", rideRoom(rideId));
  _io?.to(rideRoom(rideId)).emit(event, data);
}

/**
 * Broadcasts an event to nearby online, available drivers via a MongoDB
 * geospatial query.
 *
 * @param pickupCoordinates [longitude, latitude]
 * @param maxDistanceMeters Default 5 km
 * @returns Array of notified driverProfileIds
 */
export async function broadcastToNearbyDrivers(
  pickupCoordinates: [number, number],
  event: string,
  data: unknown,
  maxDistanceMeters = 5_000,
): Promise<string[]> {
  if (!_io) return [];

  const onlineIds = getOnlineDriverProfileIds();

  console.log("onlineIds ==>>>> ", onlineIds);
  if (onlineIds.length === 0) {
    logger.info('broadcastToNearbyDrivers: no online drivers in registry');
    return [];
  }

  const nearbyDrivers = await Driver.find({
    _id: { $in: onlineIds },
    isOnline: true,
    isOnRide: false,
    approvalStatus: 'verified',
    // currentLocation: {
    //   $near: {
    //     $geometry: { type: 'Point', coordinates: pickupCoordinates },
    //     $maxDistance: maxDistanceMeters,
    //   },
    // },
  }).select('_id');

  console.log("nearbyDrivers ===>>> ", nearbyDrivers);

  const notified: string[] = [];
  for (const driver of nearbyDrivers) {
    const id = driver._id.toString();
    if (emitToDriver(id, event, data)) notified.push(id);
  }

  logger.info(
    `broadcastToNearbyDrivers: notified ${notified.length}/${nearbyDrivers.length} nearby drivers`,
  );
  return notified;
}

/** Pushes the current online-user snapshot to all connected sockets. */
export function broadcastOnlineUsers(): void {
  _io?.emit(SocketEvents.ONLINE_USERS, getOnlineUsersSnapshot());
}

// ─── Vehicle speed lookup (km/h) for ETA calculation ─────────────────────────

const VEHICLE_SPEED_KMH: Record<string, number> = {
  MINO_GO:      40,
  MINO_COMFORT: 40,
  MINO_XL:      35,
  MINO_MOTO:    45,
};

/**
 * Broadcasts a ride_requested event to nearby online, available drivers.
 * Each driver receives a personalised payload that includes:
 *  - passenger name, profileImage, averageRating
 *  - distance (km) from the driver's current location to the pickup point
 *  - estimated arrival time (min) based on the driver's vehicle type
 *
 * @param pickupCoordinates [longitude, latitude]
 * @param basePayload       All ride fields except the per-driver distance/ETA
 * @param maxDistanceMeters Default 5 km
 * @returns Array of notified driverProfileIds
 */
export async function broadcastRideRequestToNearbyDrivers(
  pickupCoordinates: [number, number],
  basePayload: Omit<RideRequestedPayload, 'distanceToPickupKm' | 'estimatedArrivalMin'>,
  maxDistanceMeters = 5_000,
): Promise<string[]> {
  if (!_io) return [];

  const onlineIds = getOnlineDriverProfileIds();
  if (onlineIds.length === 0) {
    logger.info('broadcastRideRequestToNearbyDrivers: no online drivers');
    return [];
  }

  console.log("onlineIds ==>>>> ", onlineIds);

  const nearbyDrivers = await Driver.find({
    _id: { $in: onlineIds },
    isOnline: true,
    isOnRide: false,
    approvalStatus: 'verified',
  }).select('_id vehicleType').lean();

  const [pickupLng, pickupLat] = pickupCoordinates;

  const notified: string[] = [];

  console.log("nearbyDrivers ===>>> ", nearbyDrivers);

  for (const driver of nearbyDrivers) {
    const driverProfileId = driver._id.toString();
    const entry = onlineDrivers.get(driverProfileId);

    // Calculate per-driver distance and ETA
    let distanceToPickupKm = 2; // fallback when driver location is unknown
    if (entry?.location) {
      const [driverLng, driverLat] = entry.location;
      distanceToPickupKm = parseFloat(
        getDistanceKm(pickupLat, pickupLng, driverLat, driverLng).toFixed(2),
      );
    }

    const speed = VEHICLE_SPEED_KMH[driver.vehicleType as string] ?? 40;
    const estimatedArrivalMin = Math.ceil((distanceToPickupKm / speed) * 60);

    const payload: RideRequestedPayload = {
      ...basePayload,
      distanceToPickupKm,
      estimatedArrivalMin,
    };

    if (emitToDriver(driverProfileId, SocketEvents.RIDE_REQUESTED, payload)) {
      notified.push(driverProfileId);
    }
  }

  logger.info(
    `broadcastRideRequestToNearbyDrivers: notified ${notified.length}/${nearbyDrivers.length} drivers`,
  );
  return notified;
}

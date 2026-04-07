// ─────────────────────────────────────────────────────────────────────────────
// socket.events.ts
// Registers all Socket.IO event handlers for a single connected socket.
//
// Responsibilities:
//   • Validate every payload with Zod before processing
//   • Enforce role-based guards (passenger / driver)
//   • Delegate all business logic to RideService
//   • Manage room joins / leaves
//   • Acknowledge the caller via callback
//   • Clean up on disconnect
//
// No business logic lives here — only socket-layer concerns.
// ─────────────────────────────────────────────────────────────────────────────

import { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../app/utils/logger';
import { Driver } from '../app/modules/driver/driver.model';
import { Ride } from '../app/modules/ride/ride.model';
import { RideService } from '../app/modules/ride/ride.service';
import { MessageService } from '../app/modules/message/message.service';
import { cleanupRateLimitEntry } from './socket.server';
import {
  isManagerReady,
  registerUser,
  unregisterUser,
  updateDriverLocation,
  setDriverOnRide,
  joinRideRoom,
  leaveRideRoom,
  emitToRideRoom,
  emitToPassenger,
  emitToDriver,
  broadcastToNearbyDrivers,
  broadcastOnlineUsers,
  passengerRoom,
  driverRoom,
} from './socket.manager';
import {
  AcceptRidePayload,
  ApplyPromoPayload,
  CancelRidePayload,
  CompleteRidePayload,
  DriverOnlinePayload,
  JoinRideRoomPayload,
  RequestRidePayload,
  SocketAck,
  SocketEvents,
  StartRidePayload,
  UpdateLocationPayload,
} from './socket.types';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const RideIdSchema = z.object({ rideId: z.string().min(1) });

const CancelRideSchema = z.object({
  rideId: z.string().min(1),
  reason: z.string().min(1).max(500),
  details: z.string().max(1_000).optional(),
});

const ApplyPromoSchema = z.object({
  rideId: z.string().min(1),
  promoCode: z.string().min(1).max(50),
});

const DriverOnlineSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rideId: z.string().optional(),
});

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

type AckFn = ((result: SocketAck) => void) | undefined;

function sendAck(fn: AckFn, result: SocketAck): void {
  if (typeof fn === 'function') fn(result);
}

function validate<T>(schema: z.ZodSchema<T>, payload: unknown, ackFn: AckFn): T | null {
  const result = schema.safeParse(payload);
  if (!result.success) {
    sendAck(ackFn, {
      success: false,
      error: result.error.errors[0]?.message ?? 'Invalid payload',
      code: 400,
    });
    return null;
  }
  return result.data;
}

// ─── Main registration function ───────────────────────────────────────────────

export function registerSocketEvents(socket: Socket, _io: SocketIOServer): void {
  if (!isManagerReady()) {
    logger.error('registerSocketEvents called before socket manager was initialized');
    socket.disconnect(true);
    return;
  }

  if (!socket.user) {
    socket.disconnect(true);
    return;
  }

  const { _id: userId, role, driverProfileId, name, } = socket.user;

  // ── On-connect setup ──────────────────────────────────────────────────────

  registerUser({ socketId: socket.id, userId, role, driverProfileId });

  // Every user gets a personal room for targeted notifications
  socket.join(passengerRoom(userId));

  // Drivers also get a dedicated driver room
  if (role === 'driver' && driverProfileId) {
    socket.join(driverRoom(driverProfileId));
  }

  broadcastOnlineUsers();

  logger.info(`[CONNECT] ${name} (${role}) socket=${socket.id}`);

  // ── Legacy manual registration (backward compat) ──────────────────────────

  socket.on(SocketEvents.USER_CONNECTED, ({ userId: uid }: { userId: string }) => {
    logger.info(`Legacy userConnected event from user ${uid}`);
  });

  // ── Room management ────────────────────────────────────────────────────────

  socket.on(SocketEvents.JOIN_RIDE_ROOM, (payload: JoinRideRoomPayload, ackFn?: AckFn) => {
    const data = validate(RideIdSchema, payload, ackFn);
    if (!data) return;

    joinRideRoom(socket.id, data.rideId);
    sendAck(ackFn, { success: true, data: { rideId: data.rideId } });
  });

  socket.on(SocketEvents.LEAVE_RIDE_ROOM, (payload: JoinRideRoomPayload, ackFn?: AckFn) => {
    const data = validate(RideIdSchema, payload, ackFn);
    if (!data) return;

    leaveRideRoom(socket.id, data.rideId);
    sendAck(ackFn, { success: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PASSENGER EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * request_ride
   * Passenger confirms a ride already created via HTTP API.
   * Joins the ride room and broadcasts to nearby online drivers.
   */
  socket.on(
    SocketEvents.REQUEST_RIDE,
    async (payload: RequestRidePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'passenger') {
          return sendAck(ackFn, { success: false, error: 'Only passengers can request rides', code: 403 });
        }

        const data = validate(RideIdSchema, payload, ackFn);
        if (!data) return;

        const ride = await Ride.findById(data.rideId).populate('passenger', 'name');
        if (!ride) {
          return sendAck(ackFn, { success: false, error: 'Ride not found', code: 404 });
        }

        const passengerId =
          (ride.passenger as any)?._id?.toString() ?? ride.passenger?.toString();
        if (passengerId !== userId) {
          return sendAck(ackFn, { success: false, error: 'Unauthorized', code: 403 });
        }

        joinRideRoom(socket.id, data.rideId);

        await broadcastToNearbyDrivers(
          ride.pickupLocation.location.coordinates,
          SocketEvents.RIDE_REQUESTED,
          {
            rideId:          ride._id.toString(),
            passengerId:     userId,
            passengerName:   (ride.passenger as any)?.name ?? name,
            vehicleCategory: ride.vehicleCategory,
            serviceType:     ride.serviceType,
            pickupLocation: {
              address:     ride.pickupLocation.address,
              coordinates: ride.pickupLocation.location.coordinates,
            },
            dropoffLocation: {
              address:     ride.dropoffLocation.address,
              coordinates: ride.dropoffLocation.location.coordinates,
            },
            estimatedFare: ride.estimatedFare,
            totalFare:     ride.totalFare,
            distanceKm:    ride.distanceKm,
            scheduledAt:   ride.scheduledAt,
          },
        );

        sendAck(ackFn, { success: true, data: { rideId: data.rideId } });
      } catch (err: any) {
        logger.error(`[${SocketEvents.REQUEST_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: 'Failed to broadcast ride request', code: 500 });
      }
    },
  );

  /**
   * cancel_ride
   * Passenger or driver cancels an active ride.
   */
  socket.on(
    SocketEvents.CANCEL_RIDE,
    async (payload: CancelRidePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'passenger' && role !== 'driver') {
          return sendAck(ackFn, { success: false, error: 'Unauthorized', code: 403 });
        }

        const data = validate(CancelRideSchema, payload, ackFn);
        if (!data) return;

        const cancelledBy = role === 'passenger' ? 'PASSENGER' : 'DRIVER';
        await RideService.cancelRide(data.rideId, cancelledBy, data.reason, data.details);

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'CANCELLED' } });
      } catch (err: any) {
        logger.error(`[${SocketEvents.CANCEL_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to cancel ride', code: 500 });
      }
    },
  );

  /**
   * apply_promo
   * Passenger applies a promo code; service recalculates fares and emits PROMO_APPLIED.
   */
  socket.on(
    SocketEvents.APPLY_PROMO,
    async (payload: ApplyPromoPayload, ackFn?: AckFn) => {
      try {
        if (role !== 'passenger') {
          return sendAck(ackFn, { success: false, error: 'Only passengers can apply promo codes', code: 403 });
        }

        const data = validate(ApplyPromoSchema, payload, ackFn);
        if (!data) return;

        const result = await RideService.applyPromoToRide(data.rideId, data.promoCode);
        sendAck(ackFn, { success: true, data: result });
      } catch (err: any) {
        logger.error(`[${SocketEvents.APPLY_PROMO}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to apply promo', code: 500 });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DRIVER EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * driver:goOnline
   * Persists isOnline + location to DB and updates in-memory registry.
   */
  socket.on(
    SocketEvents.DRIVER_GO_ONLINE,
    async (payload: DriverOnlinePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can use this event', code: 403 });
        }

        const data = validate(DriverOnlineSchema, payload, ackFn);
        if (!data) return;

        const driver = await Driver.findById(driverProfileId);
        if (!driver) {
          return sendAck(ackFn, { success: false, error: 'Driver profile not found', code: 404 });
        }

        if (driver.approvalStatus !== 'verified') {
          return sendAck(ackFn, { success: false, error: 'Only verified drivers can go online', code: 403 });
        }

        const updated = await Driver.findByIdAndUpdate(
          driverProfileId,
          {
            isOnline: true,
            currentLocation: { type: 'Point', coordinates: [data.lng, data.lat] },
          },
          { new: true },
        ).select('isOnline currentLocation vehicleType');

        registerUser({ socketId: socket.id, userId, role, driverProfileId, vehicleType: updated?.vehicleType });
        updateDriverLocation(driverProfileId, [data.lng, data.lat]);

        socket.emit(SocketEvents.DRIVER_STATUS_UPDATED, {
          success: true,
          message: 'You are now online',
          data: { isOnline: true, currentLocation: updated?.currentLocation },
        });

        sendAck(ackFn, { success: true, data: { isOnline: true } });
        logger.info(`[DRIVER ONLINE] userId=${userId} lat=${data.lat} lng=${data.lng}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.DRIVER_GO_ONLINE}] error:`, err);
        socket.emit(SocketEvents.DRIVER_ERROR, { message: 'Failed to go online' });
        sendAck(ackFn, { success: false, error: 'Failed to go online', code: 500 });
      }
    },
  );

  /**
   * driver:goOffline
   * Sets driver offline in DB and removes from in-memory registry.
   */
  socket.on(SocketEvents.DRIVER_GO_OFFLINE, async (payload: {}, ackFn?: AckFn) => {

    console.log("ackFn =>>> ", ackFn);
    try {
      if (role !== 'driver' || !driverProfileId) {
        return sendAck(ackFn, { success: false, error: 'Only drivers can use this event', code: 403 });
      }

      await Driver.findByIdAndUpdate(driverProfileId, { isOnline: false });
      unregisterUser(userId, driverProfileId);

      socket.emit(SocketEvents.DRIVER_STATUS_UPDATED, {
        success: true,
        message: 'You are now offline',
        data: { isOnline: false },
      });

      console.log("offline emit =>>>> ",sendAck(ackFn, { success: true, data: { isOnline: false } }));
      sendAck(ackFn, { success: true, data: { isOnline: false } });
      logger.info(`[DRIVER OFFLINE] userId=${userId}`);
    } catch (err: any) {
      logger.error(`[${SocketEvents.DRIVER_GO_OFFLINE}] error:`, err);
      socket.emit(SocketEvents.DRIVER_ERROR, { message: 'Failed to go offline' });
      sendAck(ackFn, { success: false, error: 'Failed to go offline', code: 500 });
    }
  });

  /**
   * accept_ride
   * Driver accepts an unassigned ride; service emits RIDE_ACCEPTED to the passenger.
   */
  socket.on(
    SocketEvents.ACCEPT_RIDE,
    async (payload: AcceptRidePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can accept rides', code: 403 });
        }

        const data = validate(RideIdSchema, payload, ackFn);
        if (!data) return;

        await RideService.driverAcceptRide(data.rideId, driverProfileId);

        joinRideRoom(socket.id, data.rideId);
        setDriverOnRide(driverProfileId, true);

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'ACCEPTED' } });
        logger.info(`[ACCEPT RIDE] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.ACCEPT_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to accept ride', code: 500 });
      }
    },
  );

  /**
   * start_ride — marks the ride as ONGOING.
   */
  socket.on(
    SocketEvents.START_RIDE,
    async (payload: StartRidePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'driver') {
          return sendAck(ackFn, { success: false, error: 'Only drivers can start rides', code: 403 });
        }

        const data = validate(RideIdSchema, payload, ackFn);
        if (!data) return;

        await RideService.updateRideStatus(data.rideId, 'ONGOING');

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'ONGOING' } });
        logger.info(`[START RIDE] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.START_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to start ride', code: 500 });
      }
    },
  );

  /**
   * complete_ride — marks the ride as COMPLETED.
   */
  socket.on(
    SocketEvents.COMPLETE_RIDE,
    async (payload: CompleteRidePayload, ackFn?: AckFn) => {
      try {
        if (role !== 'driver') {
          return sendAck(ackFn, { success: false, error: 'Only drivers can complete rides', code: 403 });
        }

        const data = validate(RideIdSchema, payload, ackFn);
        if (!data) return;

        await RideService.updateRideStatus(data.rideId, 'COMPLETED');

        if (driverProfileId) setDriverOnRide(driverProfileId, false);

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'COMPLETED' } });
        logger.info(`[COMPLETE RIDE] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.COMPLETE_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to complete ride', code: 500 });
      }
    },
  );

  /**
   * driver:updateLocation
   * Persists GPS position to DB and in-memory cache.
   * If a rideId is provided, also broadcasts to the ride room.
   */
  socket.on(
    SocketEvents.UPDATE_LOCATION,
    async (payload: UpdateLocationPayload, ackFn?: AckFn) => {

      console.log("payload =>>>> ", payload);
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can update location', code: 403 });
        }

        const data = validate(LocationSchema, payload, ackFn);
        if (!data) return;

        const updatedDriver = await Driver.findOneAndUpdate(
          { _id: driverProfileId, isOnline: true },
          { currentLocation: { type: 'Point', coordinates: [data.lng, data.lat] } },
          { new: true },
        ).select('currentLocation');

        if (!updatedDriver) {
          return sendAck(ackFn, { success: false, error: 'Driver not found or not online', code: 404 });
        }

        updateDriverLocation(driverProfileId, [data.lng, data.lat]);

        socket.emit(SocketEvents.DRIVER_LOCATION_ACK, {
          success: true,
          data: { currentLocation: updatedDriver.currentLocation },
        });

        if (data.rideId) {
          const locationPayload = {
            driverProfileId,
            rideId:      data.rideId,
            coordinates: [data.lng, data.lat] as [number, number],
            updatedAt:   new Date(),
          };

          // Emit to ride room (covers anyone who joined)
          emitToRideRoom(data.rideId, SocketEvents.DRIVER_LOCATION_UPDATED, locationPayload);

          // Also emit directly to the passenger in case they missed the room join
          const ride = await Ride.findById(data.rideId).select('passenger').lean();
          if (ride?.passenger) {
            emitToPassenger(ride.passenger.toString(), SocketEvents.DRIVER_LOCATION_UPDATED, locationPayload);
          }
        }

        sendAck(ackFn, { success: true });
      } catch (err: any) {
        logger.error(`[${SocketEvents.UPDATE_LOCATION}] error:`, err);
        socket.emit(SocketEvents.DRIVER_ERROR, { message: 'Failed to update location' });
        sendAck(ackFn, { success: false, error: 'Failed to update location', code: 500 });
      }
    },
  );

  /**
   * end_ride — driver provides actual dropoff coordinates; recalculates fare.
   */
  socket.on(
    SocketEvents.END_RIDE,
    async (payload: unknown, ackFn?: AckFn) => {
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can end rides', code: 403 });
        }

        const EndRideSchema = z.object({
          rideId: z.string().min(1),
          address: z.string().min(1),
          coordinates: z.tuple([z.number(), z.number()]),
        });

        const data = validate(EndRideSchema, payload, ackFn);
        if (!data) return;

        const dropoffLocation = {
          address: data.address,
          location: { type: 'Point' as const, coordinates: data.coordinates },
        };

        await RideService.endRide(data.rideId, driverProfileId, dropoffLocation);

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'END_RIDE' } });
        logger.info(`[END RIDE] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.END_RIDE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to end ride', code: 500 });
      }
    },
  );

  /**
   * arrived_dropoff — driver arrives at actual dropoff location; recalculates fare.
   */
  socket.on(
    SocketEvents.ARRIVED_DROPOFF,
    async (payload: unknown, ackFn?: AckFn) => {
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can use this event', code: 403 });
        }

        const ArrivedDropoffSchema = z.object({
          rideId: z.string().min(1),
          address: z.string().min(1),
          coordinates: z.tuple([z.number(), z.number()]),
        });

        const data = validate(ArrivedDropoffSchema, payload, ackFn);
        if (!data) return;

        const dropoffLocation = {
          address: data.address,
          location: { type: 'Point' as const, coordinates: data.coordinates },
        };

        await RideService.arrivedDropoff(data.rideId, driverProfileId, dropoffLocation);

        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'ARRIVED_DROPOFF' } });
        logger.info(`[ARRIVED DROPOFF] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.ARRIVED_DROPOFF}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to arrive at dropoff', code: 500 });
      }
    },
  );

  /**
   * confirm_dropoff — driver confirms dropoff; passenger receives fare breakdown.
   */
  socket.on(
    SocketEvents.CONFIRM_DROPOFF,
    async (payload: unknown, ackFn?: AckFn) => {
      try {
        if (role !== 'driver' || !driverProfileId) {
          return sendAck(ackFn, { success: false, error: 'Only drivers can confirm dropoff', code: 403 });
        }

        const data = validate(RideIdSchema, payload, ackFn);
        if (!data) return;

        const ride = await Ride.findById(data.rideId).populate("passenger", "name profileImage").lean();
        if (!ride) return sendAck(ackFn, { success: false, error: 'Ride not found', code: 404 });

        await RideService.confirmDropoff(data.rideId, driverProfileId);



        sendAck(ackFn, { success: true, data: { rideId: data.rideId, status: 'CONFIRM_DROPOFF', data: {
            rideId:          (ride as any)._id.toString(),
            status:          'CONFIRM_DROPOFF',
            pickupLocation:  ride.pickupLocation,
            dropoffLocation: ride.dropoffLocation,
            distanceKm:      ride.distanceKm,
            durationMin:     ride.durationMin,
            estimatedFare:   ride.estimatedFare,
            totalFare:       ride.totalFare       ?? 0,
            driverEarning:   ride.driverEarning   ?? 0,
            adminCommission: ride.adminCommission  ?? 0,
            promoDiscount:   ride.promoDiscount    ?? 0,
            paymentMethod:   ride.paymentMethod,
            changedAt:       new Date(),
            serviceType:   ride.serviceType,
            pickupType:  ride.pickupType,
          }, } });

        logger.info(`[CONFIRM DROPOFF] driver=${userId} ride=${data.rideId}`);
      } catch (err: any) {
        logger.error(`[${SocketEvents.CONFIRM_DROPOFF}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to confirm dropoff', code: 500 });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * send_message — passenger or driver sends a chat message.
   * Persists to DB then delivers to the other participant in real time.
   */
  socket.on(
    SocketEvents.SEND_MESSAGE,
    async (payload: unknown, ackFn?: AckFn) => {
      try {
        if (role !== 'passenger' && role !== 'driver') {
          return sendAck(ackFn, { success: false, error: 'Unauthorized', code: 403 });
        }

        const SendMessageSchema = z.object({
          rideId:  z.string().min(1),
          message: z.string().min(1).max(1000),
        });


        const data = validate(SendMessageSchema, payload, ackFn);
        if (!data) return;

        // For drivers, senderId is the userId (stored on User), not driverProfileId
        const saved = await MessageService.sendMessage({
          rideId:     data.rideId,
          senderId:   userId,
          senderRole: role as 'passenger' | 'driver',
          message:    data.message,
        });

        const messagePayload = {
          _id:        (saved as any)._id,
          rideId:     data.rideId,
          senderId:   userId,
          senderRole: role,
          message:    data.message,
          createdAt:  (saved as any).createdAt,
        };

        // Deliver to the ride room (covers both participants if they joined)
        // emitToRideRoom(data.rideId, SocketEvents.MESSAGE_RECEIVED, messagePayload);

        // Also deliver directly to the receiver for reliability
        const receiverId = (saved as any).receiverId?.toString();

        console.log("payload from message =>>>> ", payload);
        let ride;
        if (receiverId) {
          
          if (role === 'passenger') {

            emitToDriver((payload as any).receiverId, SocketEvents.MESSAGE_RECEIVED, messagePayload);
            // // receiver is the driver — look up their driverProfileId to use driverRoom
            //  ride = await Ride.findById(data.rideId).select('driver').lean();

            // if (!ride) return sendAck(ackFn, { success: false, error: 'Ride not found', code: 404 });
            // if (ride?.driver) {

            //   console.log("ride.driver.toString() from driver =>>>> ", ride.driver.toString());
            //   emitToDriver(ride.driver.toString(), SocketEvents.MESSAGE_RECEIVED, messagePayload);
            // }
          } else {
            // receiver is the passenger
            console.log("ride.driver.toString() from passenger =>>>> ", receiverId);
            emitToPassenger(receiverId, SocketEvents.MESSAGE_RECEIVED, messagePayload);
          }
        }

        sendAck(ackFn, { success: true, data: messagePayload });
      } catch (err: any) {
        logger.error(`[${SocketEvents.SEND_MESSAGE}] error:`, err);
        sendAck(ackFn, { success: false, error: err.message ?? 'Failed to send message', code: 500 });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DISCONNECT
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('disconnect', async (reason) => {
    logger.info(`[DISCONNECT] ${name} (${role}) socket=${socket.id} reason=${reason}`);

    unregisterUser(userId, driverProfileId);

    if (role === 'driver' && driverProfileId) {
      await Driver.findByIdAndUpdate(driverProfileId, { isOnline: false }).catch((err) =>
        logger.error('Auto-offline on disconnect failed:', err),
      );
      logger.info(`[AUTO OFFLINE] driver=${userId}`);
    }

    cleanupRateLimitEntry(socket.id);
    broadcastOnlineUsers();
  });
}

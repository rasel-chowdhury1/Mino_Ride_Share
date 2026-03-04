import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import { createServer, Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import colors from 'colors';
import config from './app/config';
import createDefaultAdmin from './app/DB/createDefaultAdmin';
import { initSocketServer } from './socket/socket.server';
import { isManagerReady, broadcastToNearbyDrivers } from './socket/socket.manager';
import { logger } from './app/utils/logger';
import { Ride } from './app/modules/ride/ride.model';
import { SocketEvents } from './socket/socket.types';
import cron from 'node-cron';

let server: Server;
let socketHttpServer: Server;

async function main() {
  try {
    const dbStartTime = Date.now();
    const loadingFrames = ['🌍', '🌎', '🌏'];
    let frameIndex = 0;

    const loader = setInterval(() => {
      process.stdout.write(
        `\rMongoDB connecting ${loadingFrames[frameIndex]} Please wait 😢`,
      );
      frameIndex = (frameIndex + 1) % loadingFrames.length;
    }, 300);

    await mongoose.connect(config.database_url as string, {
      connectTimeoutMS: 10_000,
    });

    clearInterval(loader);
    logger.info(
      `\r✅ MongoDB connected in ${Date.now() - dbStartTime}ms`,
    );

    createDefaultAdmin();

    // Main HTTP server (REST API)
    server = createServer(app);

    // Dedicated HTTP server for Socket.IO (runs on SOCKET_PORT)
    socketHttpServer = createServer();

    server.listen(Number(config.port), () => {
      console.log(
        colors.green(
          `---> ${config.project_name} server listening on http://${config.ip}:${config.port}`,
        ).bold,
      );

      // ── Socket.IO server ───────────────────────────────────────────────
      // Runs on its own HTTP server (SOCKET_PORT), separate from REST API.
      initSocketServer(socketHttpServer).catch((err) =>
        logger.error('Socket.IO init error:', err),
      );

     
      cron.schedule('* * * * *', async () => {
        try {

          // STEP 1: Calculate the 2-minute notification window around 15 min from now
          const now        = new Date();
          const notifyTime = new Date(now.getTime() + 15 * 60 * 1_000); // +15 min

          // STEP 2: Find scheduled rides that are unassigned and due in ~15 minutes
          const scheduledRides = await Ride.find({
            status: 'REQUESTED',  // not yet accepted or cancelled
            driver: null,         // no driver assigned yet
            scheduledAt: {
              $gte: new Date(notifyTime.getTime() - 60 * 1_000), // window start: 14 min from now
              $lte: new Date(notifyTime.getTime() + 60 * 1_000), // window end:   16 min from now
            },
          });

          // STEP 3: Skip if socket layer is not ready or there are no rides to notify
          if (!isManagerReady() || scheduledRides.length === 0) return;

          // STEP 4: For each upcoming ride, broadcast to nearby online drivers
          for (const ride of scheduledRides) {
            // broadcastToNearbyDrivers:
            //   1. Reads all online driverProfileIds from the in-memory registry
            //   2. Runs a $near geospatial query to filter those within 5 km of pickup
            //   3. Emits 'ride_requested' to each reachable driver's Socket.IO room
            //   4. Returns an array of notified driverProfileIds

            const notified = await broadcastToNearbyDrivers(
              ride.pickupLocation.location.coordinates, // [lng, lat] — pickup point
              SocketEvents.RIDE_REQUESTED,
              {
                rideId:          ride._id.toString(),
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

            logger.info(
              `[CRON] Scheduled ride ${ride._id} — notified ${notified.length} drivers`,
            );


          }
        } catch (err) {
          // STEP 5: Log errors without crashing — cron retries next minute
          logger.error('[CRON] Scheduled-ride notification error:', err);
        }
      });
    });
  } catch (err) {
    logger.error('Error starting the server:', err);
  }
}

main();

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err}`);
  if (server) server.close(() => process.exit(1));
  else process.exit(1);
  
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err}`);
  if (server) server.close(() => process.exit(1));
  else process.exit(1);
});

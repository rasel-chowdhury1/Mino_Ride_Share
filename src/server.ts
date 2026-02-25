import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import {  createServer, Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import colors from 'colors'; // Ensure correct import
import config from './app/config';
import createDefaultAdmin from './app/DB/createDefaultAdmin';
import { initSocketIO } from './socketIo';
import { logger } from './app/utils/logger';
import { Ride } from './app/modules/ride/ride.model';
import { Driver } from './app/modules/driver/driver.model';
import cron from 'node-cron';


// Create a new HTTP server
const socketServer = createServer();


let server: Server;

async function main() {
  try {

    const dbStartTime = Date.now();
    const loadingFrames = ["🌍", "🌎", "🌏"]; // Loader animation frames
    let frameIndex = 0;

    // Start the connecting animation
    const loader = setInterval(() => {
      process.stdout.write(
        `\rMongoDB connecting ${loadingFrames[frameIndex]} Please wait 😢`,
      );
      frameIndex = (frameIndex + 1) % loadingFrames.length;
    }, 300); // Update frame every 300ms


    // console.log('config.database_url', config.database_url);


    // Connect to MongoDB with a timeout
    await mongoose.connect(config.database_url as string, {
      connectTimeoutMS: 10000, // 10 seconds timeout
    });


    // Stop the connecting animation
    clearInterval(loader);
    logger.info(
      `\r✅ Mongodb connected successfully in ${Date.now() - dbStartTime}ms`,
    );

    //create a defult admin
    createDefaultAdmin()


    // Start HTTP server
    server = createServer(app);

    server.listen(Number(config.port),  () => {
      console.log(
        colors.green(`---> ${config.project_name} server is listening on  : http://${config.ip}:${config.port}`).bold,
      );
    // Initialize Socket.IO
    initSocketIO(socketServer);

    // Run every minute
    cron.schedule('* * * * *', async () => {
      const now = new Date();
      const notifyTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins later

      // Find rides scheduled ~15 mins from now
      const rides = await Ride.find({
        status: 'REQUESTED',
        driver: null,
        scheduledAt: {
          $gte: new Date(notifyTime.getTime() - 60 * 1000), // 1 min before
          $lte: new Date(notifyTime.getTime() + 60 * 1000), // 1 min after
        },
      });

      for (const ride of rides) {
        // Find nearby drivers (example radius 5km)
        const nearbyDrivers = await Driver.find({
          location: {
            $near: {
              $geometry: ride.pickupLocation.location,
              $maxDistance: 5000, // 5km radius
            },
          },
          isAvailable: true,
        });

        // Send notification to drivers
        for (const driver of nearbyDrivers) {
          // Replace this with your push notification / socket implementation
          console.log(`Notify driver ${driver._id} about ride ${ride._id}`);
        }
      }
    });

    });
  } catch (err) {
    console.error('Error starting the server:', err);
    console.log(err);
  }
}

main();

// Graceful shutdown for unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled rejection detected: ${err}`);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
  process.exit(1); // Ensure process exits
});

// Graceful shutdown for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception detected: ${err}`);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});


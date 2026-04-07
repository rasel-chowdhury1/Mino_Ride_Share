// ─────────────────────────────────────────────────────────────────────────────
// socket.server.ts
// Bootstraps the Socket.IO server with:
//   • JWT auth middleware
//   • Per-socket event rate limiter
//   • Global error interceptor
//   • Optional Redis adapter (install @socket.io/redis-adapter + redis)
//   • Connection-state recovery for 2-minute disconnects
// ─────────────────────────────────────────────────────────────────────────────

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import colors from 'colors';
import config from '../app/config';
import { verifyToken } from '../app/utils/tokenManage';
import { User } from '../app/modules/user/user.model';
import { logger } from '../app/utils/logger';
import { ISocketUser } from './socket.types';
import { initManager } from './socket.manager';
import { registerSocketEvents } from './socket.events';
import { registerNotificationEvents } from './notification.events';

// ─── Augment socket.io typings ───────────────────────────────────────────────

declare module 'socket.io' {
  interface Socket {
    user?: ISocketUser;
  }
}

// ─── Module-level IO reference ───────────────────────────────────────────────

let _io: SocketIOServer | null = null;

export const getIO = (): SocketIOServer => {
  if (!_io) throw new Error('Socket.IO server has not been initialized yet');
  return _io;
};

// ─── Rate limiter ────────────────────────────────────────────────────────────
// Simple in-memory per-socket sliding-window counter.
// For multi-node deployments, swap with an ioredis-backed solution.

const RATE_LIMIT_MAX = 30;          // max events allowed per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute window

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const _rateLimitMap = new Map<string, RateLimitEntry>();

export function cleanupRateLimitEntry(socketId: string): void {
  _rateLimitMap.delete(socketId);
}

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const entry = _rateLimitMap.get(socketId);

  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(socketId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// ─── Middleware: JWT authentication ──────────────────────────────────────────

const authMiddleware = async (
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> => {
  try {
    const token =
      (socket.handshake.auth.token as string | undefined) ||
      (socket.handshake.headers.token as string | undefined) ||
      (socket.handshake.headers.authorization as string | undefined);

    if (!token) {
      return next(new Error('Authentication error: token missing'));
    }

    const payload = verifyToken({
      token,
      access_secret: config.jwt_access_secret as string,
    });

    if (!payload) {
      return next(new Error('Authentication error: invalid token'));
    }

    const user = await User.findById(payload.userId).select(
      'name email role driverProfileId isDeleted',
    );

    if (!user || user.isDeleted) {
      return next(new Error('Authentication error: user not found'));
    }

    socket.user = {
      _id: user._id.toString(),
      name: user.name as string,
      email: user.email,
      role: user.role as ISocketUser['role'],
      driverProfileId: (user.driverProfileId as any)?.toString(),
      country: (payload as any).country,
    };

    next();
  } catch (err) {
    logger.error('Socket auth middleware error:', err);
    next(new Error('Authentication error: verification failed'));
  }
};

// ─── Middleware: per-event rate limiter ───────────────────────────────────────

const rateLimitMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  // Wrap the socket's event pipeline
  socket.use(([event, ...args], proceed) => {
    if (isRateLimited(socket.id)) {
      const ackFn = args[args.length - 1];
      if (typeof ackFn === 'function') {
        ackFn({ success: false, error: 'Rate limit exceeded', code: 429 });
      } else {
        socket.emit('error', { message: 'Rate limit exceeded', code: 429 });
      }
      logger.warn(`Rate limit hit — socket ${socket.id} event [${event}]`);
      return; // drop the event
    }
    proceed();
  });

  next();
};

// ─── Middleware: global error interceptor ─────────────────────────────────────

const errorMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  socket.use(([event], proceed) => {
    try {
      proceed();
    } catch (err) {
      logger.error(`Unhandled error in socket event [${event}]:`, err);
      socket.emit('error', { message: 'Internal server error', event });
    }
  });

  next();
};

// ─── Optional Redis adapter ───────────────────────────────────────────────────
// Enables horizontal scaling across multiple Node.js processes / servers.
//
// To activate:
//   1. npm install @socket.io/redis-adapter redis
//   2. Set REDIS_URL in .env (e.g. redis://localhost:6379)
//
// Without REDIS_URL the server works in single-node (in-memory) mode.

async function applyRedisAdapter(io: SocketIOServer): Promise<void> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    // No REDIS_URL → perfectly fine for single-server deployments.
    // Only needed when running multiple Node.js instances behind a load balancer.
    logger.info('Socket.IO running in single-node mode (no REDIS_URL set).');
    return;
  }

  try {
    const { createAdapter } = await import('@socket.io/redis-adapter' as any);
    const { createClient } = await import('redis' as any);

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: Error) =>
      logger.error('Redis pub client error:', err),
    );
    subClient.on('error', (err: Error) =>
      logger.error('Redis sub client error:', err),
    );

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));

    logger.info(
      'Socket.IO Redis adapter connected — horizontal scaling enabled',
    );

  } catch (err) {
    logger.warn(
      'Redis adapter unavailable. Ensure "@socket.io/redis-adapter" and "redis" ' +
        'are installed and REDIS_URL is reachable. Falling back to in-memory adapter.',
    );
  }
}

// ─── Main bootstrap ───────────────────────────────────────────────────────────

export const initSocketServer = async (
  httpServer: HttpServer,
): Promise<SocketIOServer> => {
  const socketPort = parseInt(process.env.SOCKET_PORT || '8020', 10);

  const { Server } = await import('socket.io');

  _io = new Server(httpServer, {
    cors: {
      origin: config.client_Url || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },

    pingTimeout: 60_000,

    pingInterval: 25_000,
    
    transports: ['websocket', 'polling'],

    // Allows clients to resume their session after a brief network dropout
    // without losing room membership or buffered events.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },


  });

  // Optional Redis adapter (must come before middleware so all nodes share state)
  await applyRedisAdapter(_io);

  // Middleware chain (order matters)
  _io.use(authMiddleware);
  _io.use(rateLimitMiddleware);
  _io.use(errorMiddleware);

  // Boot the manager before any connections arrive
  initManager(_io);

  // Register all domain event handlers
  _io.on('connection', (socket) => {
    registerSocketEvents(socket, _io!);
    registerNotificationEvents(socket);
  });

  // Start the dedicated socket HTTP server on SOCKET_PORT
  httpServer.listen(socketPort, () => {
    console.log(
      colors.magenta(
        `---> ${config.project_name} socket server listening on ` +
          `http://${config.ip}:${socketPort}`,
      ).bold,
    );
  });

  return _io;
};

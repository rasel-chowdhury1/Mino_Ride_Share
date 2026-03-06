# Mino Ride Share — Backend API

Production-ready Node.js + TypeScript backend for the **Mino Ride Share** platform. Includes a REST API, real-time Socket.IO server, geospatial ride matching, fare estimation, promo codes, OTP verification, and push/email notifications.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Real-time | Socket.IO 4.x (separate port) |
| Scaling | Redis adapter (`@socket.io/redis-adapter`) |
| Auth | JWT (access + refresh tokens) |
| OTP | Twilio SMS |
| Email | Nodemailer |
| Payments | Stripe |
| File Storage | AWS S3 |
| Logging | Winston + daily rotate |
| Validation | Zod |
| Scheduling | node-cron |

---

## Project Structure

```
src/
├── app/
│   ├── config/          # Environment config
│   ├── DB/              # Default admin seeder
│   ├── error/           # AppError class + global error handler
│   ├── middleware/       # Auth middleware, rate limiting
│   ├── modules/
│   │   ├── auth/        # Login, register, refresh token
│   │   ├── driver/      # Driver profile, verification, location
│   │   ├── fare/        # Fare rules per vehicle & country
│   │   ├── feedback/    # Ride feedback/ratings
│   │   ├── notifications/ # In-app notifications
│   │   ├── otp/         # OTP generation & verification (Twilio)
│   │   ├── promo/       # Promo codes & discounts
│   │   ├── ride/        # Ride lifecycle (create → complete)
│   │   ├── setting/     # App settings
│   │   └── user/        # User profile management
│   ├── routes/          # Central route aggregator
│   └── utils/           # Shared utilities (logger, email, token, etc.)
├── socket/
│   ├── socket.server.ts      # Socket.IO bootstrap, JWT auth, rate limiter, Redis adapter
│   ├── socket.manager.ts     # Online users/drivers registry, room helpers, emit functions
│   ├── socket.events.ts      # Ride-domain socket event handlers
│   ├── notification.events.ts # Notification socket events, connectedUsers map
│   └── socket.types.ts       # TypeScript interfaces, SocketEvents const, Zod schemas
├── socketIo.ts          # Public socket API (emitNotification, notification helpers)
├── app.ts               # Express app setup
└── server.ts            # Entry point, HTTP server, cron jobs
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB
- (Optional) Redis — for horizontal Socket.IO scaling

### Installation

```bash
git clone https://github.com/rasel-chowdhury1/Mino_Ride_Share.git
cd Mino_Ride_Share
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
# App
NODE_ENV=development
PROJECT_NAME=Mino Ride Share
PORT=8010
IP=localhost
SERVER_URL=http://localhost:8010
CLIENT_URL=http://localhost:3000

# Database
DATABASE_URL=mongodb://localhost:27017/mino_ride_share

# Socket.IO
SOCKET_PORT=9020

# JWT
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=30d

# Bcrypt
BCRYPT_SALT_ROUNDS=12

# Default Admin
ADMIN_EMAIL=admin@minorideshere.com
ADMIN_PASSWORD=Admin@1234
ADMIN_PHONE=+8801700000000

# Email (Nodemailer)
NODEMAILER_HOST=smtp.gmail.com
NODEMAILER_PORT=587
NODEMAILER_HOST_EMAIL=your@gmail.com
NODEMAILER_HOST_PASS=your_app_password
NODEMAILER_FROM_NAME=Mino Ride Share

# OTP / SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Stripe
STRIPE_API_KEY=pk_test_xxxx
STRIPE_API_SECRET=sk_test_xxxx

# AWS S3
S3_BUCKET_ACCESS_KEY=your_access_key
S3_BUCKET_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-southeast-1
AWS_BUCKET_NAME=your-bucket

# Redis (optional — enables horizontal Socket.IO scaling)
# Get from Upstash: rediss://default:PASSWORD@host:6379
REDIS_URL=rediss://default:xxxx@quality-fly-16092.upstash.io:6379

# Branding
LOGO_URL=https://your-logo-url.com/logo.png
PRIMARY_COLOR=#FF6B35
SUPPORT_EMAIL=support@minorideshere.com
```

### Run

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm run start:prod
```

---

## REST API

> Base URL: `http://localhost:8010/api/v1`
> All protected routes require: `Authorization: Bearer <token>`

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login |
| POST | `/auth/refresh-token` | Public | Refresh access token |
| POST | `/auth/logout` | Auth | Logout |
| POST | `/auth/forgot-password` | Public | Send reset OTP |
| POST | `/auth/reset-password` | Public | Reset password |
| POST | `/auth/change-password` | Auth | Change password |

### OTP

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/otp/send` | Public | Send OTP via SMS |
| POST | `/otp/verify` | Public | Verify OTP |

### Users

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Auth | Get own profile |
| PATCH | `/users/me` | Auth | Update profile |
| GET | `/users` | Admin | Get all users |

### Drivers

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/drivers/create` | Passenger | Apply as driver |
| GET | `/drivers/me` | Driver | Get own driver profile |
| PATCH | `/drivers/me` | Driver | Update driver profile |
| GET | `/drivers` | Admin | Get all drivers |
| PATCH | `/drivers/:id/verify` | Admin | Verify a driver |

### Rides

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/ride/estimate` | Passenger | Get fare estimates for all vehicle types |
| POST | `/ride/motorcycle-estimate` | Passenger | Get motorcycle fare estimates |
| POST | `/ride/create` | Passenger | Create a ride request |
| POST | `/ride/:rideId/accept` | Driver | Accept a ride |
| PATCH | `/ride/:id/status` | Driver | Update ride status (`ONGOING` / `COMPLETED` / `CANCELLED`) |
| GET | `/ride/passenger` | Passenger | Get own ride history |
| GET | `/ride/driver` | Driver | Get own ride history |
| GET | `/ride/nearest` | Driver | Get nearest pending rides |
| GET | `/ride/admin` | Admin | Get all rides |

**Create Ride body:**
```json
{
  "vehicleCategory": "MINO_GO",
  "serviceType": "STANDARD",
  "distanceKm": 5.2,
  "durationMin": 15,
  "estimatedFare": 120,
  "totalFare": 130,
  "driverEarning": 104,
  "adminCommission": 26,
  "pickupLocation": {
    "address": "Mirpur 10, Dhaka",
    "location": { "type": "Point", "coordinates": [90.4125, 23.8103] }
  },
  "dropoffLocation": {
    "address": "Gulshan 2, Dhaka",
    "location": { "type": "Point", "coordinates": [90.4152, 23.7925] }
  }
}
```

### Fare

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/fare` | Admin | Create fare rule |
| GET | `/fare` | Auth | Get all fare rules |
| PATCH | `/fare/:id` | Admin | Update fare rule |
| DELETE | `/fare/:id` | Admin | Delete fare rule |

### Promo Codes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/promo` | Admin | Create promo code |
| GET | `/promo` | Auth | Get all promos |
| PATCH | `/promo/:id` | Admin | Update promo |
| DELETE | `/promo/:id` | Admin | Delete promo |

### Notifications

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/notifications` | Auth | Get my notifications |
| PATCH | `/notifications/read` | Auth | Mark all as read |

### Feedback

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/feedback` | Auth | Submit feedback |
| GET | `/feedback` | Admin | Get all feedback |

---

## Socket.IO

> URL: `http://localhost:9020`
> Auth: send JWT in handshake headers or `auth.token`

```js
const socket = io('http://localhost:9020', {
  auth: { token: 'Bearer <your_jwt>' }
});
```

### Connection Events (server → client)

| Event | Description |
|---|---|
| `notification` | Unread notification count on connect |
| `onlineUser` | Array of online user IDs |

### Passenger Events (client → server)

| Event | Payload | Description |
|---|---|---|
| `request_ride` | `{ rideId }` | Broadcast ride to nearby drivers |
| `cancel_ride` | `{ rideId, reason, details }` | Cancel a ride |
| `apply_promo` | `{ rideId, promoCode }` | Apply promo code to ride |
| `join_ride_room` | `{ rideId }` | Join ride room for updates |
| `leave_ride_room` | `{ rideId }` | Leave ride room |
| `readNotification` | — | Mark all notifications as read |

### Driver Events (client → server)

| Event | Payload | Description |
|---|---|---|
| `driver:goOnline` | `{ lat, lng }` | Go online and set location |
| `driver:goOffline` | — | Go offline |
| `driver:updateLocation` | `{ lat, lng, rideId }` | Update real-time location |
| `accept_ride` | `{ rideId }` | Accept a ride |
| `start_ride` | `{ rideId }` | Start a ride |
| `complete_ride` | `{ rideId }` | Complete a ride |

### Server → Client Events

| Event | Who | Description |
|---|---|---|
| `ride_requested` | Nearby drivers | New ride available |
| `ride_accepted` | Passenger + ride room | Driver accepted |
| `ride_started` | Ride room | Ride started |
| `ride_status_updated` | Ride room | Status changed |
| `ride_completed` | Ride room | Ride completed |
| `ride_cancelled` | Ride room | Ride cancelled |
| `promo_applied` | Passenger | Promo applied successfully |
| `driver_location_updated` | Ride room | Driver GPS update |
| `driver:statusUpdated` | Driver | Online/offline confirmed |

### Typical Flow

```
PASSENGER                     DRIVER
─────────                     ──────
POST /ride/create             driver:goOnline
request_ride          ──→     ride_requested
                              accept_ride
ride_accepted         ←──
join_ride_room
                              start_ride
ride_started          ←──
                              driver:updateLocation (repeat)
driver_location_updated ←──
                              complete_ride
ride_completed        ←──
```

---

## Architecture

### Socket Layer

```
socket.server.ts       — IO bootstrap, JWT auth middleware, rate limiter (30 req/min),
                         Redis adapter, connection-state recovery (2 min)
socket.manager.ts      — online driver/user registry, geospatial broadcast,
                         room helpers (passenger:{id}, driver:{id}, ride:{id})
socket.events.ts       — ride domain events (request, accept, start, complete, cancel)
notification.events.ts — connectedUsers map, readNotification, online user broadcast
```

### Cron Jobs

- **Every minute** — find scheduled rides due in ~15 minutes, broadcast `ride_requested` to nearby online drivers

### Redis Scaling

Set `REDIS_URL` in `.env` to enable multi-node Socket.IO with Upstash (or any Redis instance):

```
REDIS_URL=rediss://default:PASSWORD@host:6379
```

Without `REDIS_URL`, the server runs in single-node in-memory mode (fine for single-server deployments).

---

## Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript to dist/
npm run start:prod   # Run compiled production build
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint errors
npm run prettier     # Format source files
```

---

## Author

**Rasel Chowdhury**

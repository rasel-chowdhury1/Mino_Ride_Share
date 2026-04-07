# Mino Ride Share — Backend API

A production-ready ride-sharing backend built with **Node.js**, **Express**, **TypeScript**, **MongoDB**, and **Socket.IO**. Supports real-time ride matching, Stripe payments, in-ride chat, admin dashboards, and horizontal scaling via Redis.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Socket.IO Events](#socketio-events)
- [Ride Status Flow](#ride-status-flow)
- [Payment Flow](#payment-flow)
- [Scripts](#scripts)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | MongoDB + Mongoose (GeoJSON / 2dsphere) |
| Real-time | Socket.IO 4.x (separate port) |
| Scaling | Redis adapter (`@socket.io/redis-adapter`) |
| Auth | JWT (access + refresh tokens) |
| Email | Nodemailer |
| Payments | Stripe Checkout |
| File Upload | Multer |
| Logging | Winston + daily rotate |
| Validation | Zod |
| Scheduling | node-cron |

---

## Project Structure

```
src/
├── app/
│   ├── modules/
│   │   ├── auth/           # Login, refresh token, OTP, password reset
│   │   ├── user/           # Registration, profiles, admin actions (warn/ban)
│   │   ├── driver/         # Driver online/offline toggle
│   │   ├── ride/           # Ride lifecycle (create → complete)
│   │   ├── payment/        # Stripe checkout, webhooks, payment history
│   │   ├── fare/           # Country-based fare config
│   │   ├── promo/          # Promo codes & discounts
│   │   ├── feedback/       # User feedback & ratings
│   │   ├── report/         # Incident reports
│   │   ├── message/        # In-ride chat
│   │   ├── notifications/  # Push notifications
│   │   ├── otp/            # OTP management
│   │   ├── setting/        # Privacy, terms, about us
│   │   └── dashboard/      # Admin analytics
│   ├── middleware/         # Auth, file upload, validation, error handling
│   ├── builder/            # QueryBuilder utility (search, filter, paginate)
│   ├── config/             # Environment configuration
│   ├── utils/              # Helpers (logger, email, token, stripe, etc.)
│   └── DB/                 # Default admin seed
├── socket/
│   ├── socket.server.ts    # Socket.IO server init + Redis adapter
│   ├── socket.manager.ts   # Singleton: rooms, emit helpers
│   ├── socket.events.ts    # All event handlers with Zod validation
│   └── socket.types.ts     # Event constants & payload types
├── app.ts                  # Express app
└── server.ts               # HTTP server + cron jobs
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB Atlas or local MongoDB
- Redis (optional — for Socket.IO horizontal scaling)
- Stripe account

### Installation

```bash
git clone <repo-url>
cd Mino_Ride_Share
npm install
```

### Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
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

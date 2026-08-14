# 🎓 CampusGig — Backend API & Real-Time Engine

[![Node.js](https://img.shields.io/badge/Node.js-v20+-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.22-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v7.0+-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.8-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Redis](https://img.shields.io/badge/Redis-Adapter-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Jest Tests](https://img.shields.io/badge/Tests-93%2F93%20Passed-brightgreen?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![Live Audit](https://img.shields.io/badge/API%20Audit-100%25%20Passed-brightgreen?style=for-the-badge&logo=checkmarx&logoColor=white)](https://github.com/not-a-hack-er/campus_gig-backend)

CampusGig is a high-performance, production-grade REST API and real-time WebSocket backend tailored for the **CampusGig** mobile application — a student freelancing marketplace and campus gig platform.

---

## 🌟 Key Features

### 🛡️ Enterprise-Grade Security & Auth
- **JWT Authentication**: Stateless token-based authentication with cryptographically signed tokens.
- **Google OAuth Token Verification**: Server-side ID token validation with Google APIs using `google-auth-library` (plus device account picker fallback).
- **Anti-Brute Force Rate Limiting**: Tiered IP-based rate limiting via `express-rate-limit` (strict limits on `/api/auth/*` and baseline global limits).
- **NoSQL Injection Defense**: Sanitization of request queries, parameters, and bodies with `express-mongo-sanitize`.
- **HTTP Security Headers**: 14+ defensive HTTP headers configured via `helmet`.
- **Anti-Enumeration Protections**: Unified `401 Unauthorized` responses on login failures to prevent user email enumeration.

### 💼 Gig & Application Marketplace
- **Full Gig Lifecycle**: `OPEN` → `IN_PROGRESS` → `COMPLETED` / `CANCELLED`.
- **Rich Multi-Filter Search**: Search and filter gigs by category, keywords, budget range, and status.
- **CAS Concurrency Control**: Atomic Compare-And-Swap (`findOneAndUpdate({ status: "OPEN" })`) prevents double-acceptance races without requiring heavy multi-document replica set transactions.
- **Field Virtuals & Aliases**: Native backward compatibility with Android field naming (`skills` ↔ `skillsRequired`, `employer` ↔ `postedBy`, etc.).

### 💬 Real-Time Chat & Live Presence
- **Socket.IO Real-Time Engine**: Instant messaging, room joining, typing indicators, and read receipts.
- **Horizontal Scaling with Redis**: Optional Redis Pub/Sub adapter (`@socket.io/redis-adapter` + `ioredis`) for multi-instance clusters and serverless containers.
- **Live User Presence**: Real-time tracking of online/offline student status across rooms.

### 👥 Campus Communities & Social Feed
- **Community Hubs**: Category-specific student groups (Android Dev, AI, Web Dev, Design, etc.).
- **Atomic Memberships**: Idempotent `$addToSet` and `$pull` operations for race-condition-safe join/leave flows.
- **Discussion Feed**: Posts with author population and timestamps.

### 🌟 Dynamic Reputation & Review Engine
- **Self-Review Prevention**: Strict validation blocking authors from reviewing themselves.
- **Auto-Recalculating Averages**: Real-time recalculation of user `rating` (1–5 scale) and `totalReviews` upon review creation.

### ⚡ Production Architecture & Observability
- **MongoDB Connection Pool**: Configured with `maxPoolSize: 100`, `minPoolSize: 10`, fail-fast timeouts (5s), and reconnection resilience.
- **High-Speed Structured Logging**: Async, zero-overhead JSON logging using `pino` and `pino-http`.
- **Graceful Shutdown**: Intercepts `SIGTERM`/`SIGINT` to cleanly flush in-flight HTTP requests, Socket connections, and database writes.

---

## 🏛️ Architecture & Tech Stack

```
campus_gig-backend/
├── audit/                  # End-to-end live server API audit test runner
│   └── api_audit.js        # 18 audit suites with 132 validation checks
├── src/
│   ├── config/             # DB connection pool, env loader, Pino logger
│   ├── controllers/        # Request/response HTTP controllers
│   ├── middleware/         # Auth, Error handler, Rate limiters, Multer/Cloudinary
│   ├── models/             # Mongoose schemas (User, Gig, Application, Review, etc.)
│   ├── routes/             # Express API route declarations
│   ├── scripts/            # Database seed and reset utilities
│   ├── services/           # Core business logic & database queries
│   ├── sockets/            # Socket.IO event handlers (chat, presence, pub/sub)
│   ├── utils/              # ApiError, ApiResponse, helper functions
│   ├── app.js              # Express app initialization & security middlewares
│   └── server.js           # Server entry point & graceful shutdown hooks
├── tests/                  # Automated Jest unit and integration test suites
│   ├── applications.test.js
│   ├── auth.test.js
│   ├── gigs.test.js
│   ├── notifications.test.js
│   ├── reviews.test.js
│   └── users.test.js
├── .env.example            # Environment variable template
├── .gitignore              # Git ignore rules for node_modules, secrets, uploads
├── package.json
└── README.md
```

---

## 🔌 API Endpoints Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user | ❌ No |
| `POST` | `/api/auth/login` | Log in with email & password | ❌ No |
| `POST` | `/api/auth/google` | Google OAuth token sign-in | ❌ No |

### 👤 Users & Profiles (`/api/users`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/users/me` | Fetch logged-in user profile | 🔒 Yes |
| `PUT` | `/api/users/me` | Update bio, skills, college, portfolio links | 🔒 Yes |
| `GET` | `/api/users/me/stats` | Fetch user statistics (gigs posted/completed) | 🔒 Yes |
| `GET` | `/api/users/me/gigs` | Fetch gigs created by current user | 🔒 Yes |
| `GET` | `/api/users/me/reviews` | Fetch reviews received by current user | 🔒 Yes |
| `POST` | `/api/users/me/change-password` | Update current account password | 🔒 Yes |
| `POST` | `/api/users/me/avatar` | Upload profile photo (disk / Cloudinary) | 🔒 Yes |
| `GET` | `/api/users/colleges` | Search college directory (`?q=IIT`) | ❌ No |
| `GET` | `/api/users/:id` | View public profile of any student | ❌ No |

### 💼 Gigs (`/api/gigs`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/gigs` | List all gigs (filters: `category`, `keyword`, `minBudget`, `maxBudget`, `status`) | ❌ No |
| `POST` | `/api/gigs` | Create a new gig | 🔒 Yes |
| `GET` | `/api/gigs/:id` | Get details of a specific gig | ❌ No |
| `PUT` | `/api/gigs/:id` | Update gig details (owner only) | 🔒 Yes |
| `DELETE`| `/api/gigs/:id` | Delete a gig (owner only) | 🔒 Yes |

### 📝 Applications (`/api/applications`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/applications/:gigId` | Apply for an open gig with proposal & budget | 🔒 Yes |
| `GET` | `/api/applications/my` | Get all applications submitted by logged-in user | 🔒 Yes |
| `GET` | `/api/applications/gig/:gigId` | Get all applications for a gig (owner only) | 🔒 Yes |
| `PATCH`| `/api/applications/:id/status`| Accept/Reject application (CAS atomic update) | 🔒 Yes |

### ⭐ Reviews (`/api/reviews`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/reviews/:userId` | Submit rating (1-5) and feedback for a student | 🔒 Yes |
| `GET` | `/api/reviews/:userId` | List all reviews received by a student | ❌ No |

### 👥 Communities (`/api/communities`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/communities` | List all communities | ❌ No |
| `POST` | `/api/communities` | Create a new community | 🔒 Yes |
| `GET` | `/api/communities/:id` | Get community details & member list | ❌ No |
| `POST` | `/api/communities/:id/join` | Join a community | 🔒 Yes |
| `POST` | `/api/communities/:id/leave`| Leave a community | 🔒 Yes |
| `POST` | `/api/communities/:communityId/posts` | Post a message to a community | 🔒 Yes |
| `GET` | `/api/communities/:communityId/feed` | Get recent feed posts for a community | ❌ No |

### 💬 Chat & Direct Messages (`/api/chat` & `/api/messages`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/chat/conversation` | Create or get existing 1-on-1 chat room | 🔒 Yes |
| `GET` | `/api/chat/messages/:conversationId` | Fetch message history for a conversation | 🔒 Yes |
| `GET` | `/api/messages/conversations` | List all active direct conversations | 🔒 Yes |
| `GET` | `/api/messages/:userId` | Fetch conversation with specific user | 🔒 Yes |

### 🔔 Notifications (`/api/notifications`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/notifications` | Get user notifications list | 🔒 Yes |
| `PATCH`| `/api/notifications/:id/read` | Mark individual notification as read | 🔒 Yes |
| `PUT` | `/api/notifications/read-all` | Mark all notifications as read | 🔒 Yes |

---

## ⚡ Real-Time Socket.IO Events

| Event Name | Direction | Payload / Description |
|---|---|---|
| `join_room` | Client ➔ Server | `{ roomId: string }` — Joins private chat room |
| `send_message` | Client ➔ Server | `{ roomId, receiverId, message }` — Sends direct message |
| `new_message` | Server ➔ Client | Emits message payload to participants |
| `typing` | Bidirectional | `{ roomId, isTyping: boolean }` — Typing indicator |
| `online_users` | Server ➔ Client | Broadcasts list of active user IDs |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.x or v20.x+
- **MongoDB**: Local MongoDB community server or MongoDB Atlas connection URI
- **Redis** *(Optional)*: For multi-instance Socket.IO clustering

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/not-a-hack-er/campus_gig-backend.git
cd campus_gig-backend

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy the `.env.example` template to `.env`:
```bash
cp .env.example .env
```

Configure your variables in `.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/campus_gig
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
CLIENT_URL=http://localhost:3000

# Optional configurations
# REDIS_URL=redis://localhost:6379
# CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
# GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
```

### 4. Running Locally
```bash
# Start development server with automatic reload
npm run dev

# Start standard production server
npm start
```

Default access endpoints:
- **Local machine**: `http://localhost:5000`
- **Android Emulator**: `http://10.0.2.2:5000`

---

## 🧪 Testing & Quality Assurance

### Run Jest Test Suite (93 unit & integration tests)
```bash
npm test
```

### Run Full Live API Audit (132 checks across all 18 test sections)
```bash
# Ensure server is running, then in a separate terminal:
npm run audit
```

---

## 📄 License
This project is licensed under the **MIT License**.

# LeadFlow CRM

A production-ready AI-powered lead generation, nurturing, and closing system built with React, Node.js, Prisma, and PostgreSQL.

## Features

- **Lead Management** — CRUD, CSV import, enrichment, scoring, search & filter
- **Email Sequences** — Multi-step automation with open/click tracking
- **Sales Pipeline** — Kanban board with drag-and-drop deal management
- **Meeting Scheduler** — Public booking links with availability management
- **Quotes & Invoices** — PDF generation with line items and tax
- **Dashboard** — Real-time analytics and engagement metrics
- **Notifications** — In-app notifications for key events
- **Multi-tenancy** — Organization-scoped data with JWT auth

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Zustand, TanStack Query |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL 15 |
| Queue | BullMQ + Redis |
| Auth | JWT (access + refresh tokens) |

## Quick Start (Docker)

### Prerequisites
- Docker Desktop installed and running
- Git

### 1. Clone and configure

```bash
git clone <repo-url>
cd leadflow-crm
cp server/.env.example server/.env
```

### 2. Start all services

```bash
docker-compose up --build
```

### 3. Run database migrations and seed

In a new terminal:
```bash
docker-compose exec backend npx prisma migrate dev --name init
docker-compose exec backend npm run seed
```

### 4. Access the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001/api/v1 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

**Demo credentials:** `admin@demo.com` / `password123`

---

## Local Development (Without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 15
- Redis 7

### Setup

```bash
# Backend
cd server
cp .env.example .env
# Edit .env with your local DB/Redis credentials
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run dev
```

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/leadflow` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Access token secret (32+ chars) | `change-me-in-production` |
| `JWT_REFRESH_SECRET` | Refresh token secret (32+ chars) | `change-me-in-production` |
| `JWT_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `PORT` | Server port | `3001` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `OPENAI_API_KEY` | Optional: OpenAI for AI suggestions | (empty = mock mode) |

---

## API Overview

Base URL: `http://localhost:3001/api/v1`

All protected endpoints require: `Authorization: Bearer <access_token>`

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Leads | `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`, `POST /leads/import`, `POST /leads/:id/enrich` |
| Pipeline | `GET/POST /pipeline`, `PUT/DELETE /pipeline/:id` |
| Sequences | `GET/POST /sequences`, `GET/PUT/DELETE /sequences/:id`, sequence steps & enrollment |
| Meetings | `GET/POST /meetings`, booking endpoint (public) |
| Quotes | `GET/POST /quotes`, PDF download, send/pay actions |
| Notifications | `GET /notifications`, mark read |
| Dashboard | `GET /dashboard/stats` |

---

## Project Structure

```
leadflow-crm/
├── client/                    # React Vite frontend
│   ├── src/
│   │   ├── api/               # Axios API clients
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Route-level pages
│   │   ├── store/             # Zustand state stores
│   │   └── utils/             # Helpers
│   ├── vite.config.js
│   └── tailwind.config.js
├── server/                    # Node.js Express backend
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.js            # Demo data seeder
│   └── src/
│       ├── controllers/       # Request handlers
│       ├── middleware/        # Auth, error, validation
│       ├── routes/            # Route definitions
│       ├── services/          # Business logic
│       ├── utils/             # Helpers (JWT, PDF, email)
│       └── workers/           # BullMQ background jobs
├── docker-compose.yml
└── README.md
```

---

## Deployment

### Frontend → Vercel

```bash
cd client
npm run build
# Deploy dist/ to Vercel
# Set VITE_API_URL to your backend URL
```

### Backend + DB → Railway or Render

1. Connect your Git repo
2. Set root directory to `server/`
3. Add PostgreSQL and Redis add-ons
4. Configure environment variables from `.env.example`
5. Set start command: `npx prisma migrate deploy && npm start`

### Environment Notes for Production

- Use strong random values for `JWT_SECRET` and `JWT_REFRESH_SECRET` (min 64 chars)
- Set `NODE_ENV=production`
- Configure `FRONTEND_URL` to your Vercel domain for CORS

---

## Seed Data

The seed script creates:
- 1 Organization: "Demo Company"
- 1 Admin user: `admin@demo.com` / `password123`
- 1 Sales Rep: `salesrep@demo.com` / `password123`
- 10 Demo leads with varied statuses
- 1 Email sequence with 3 steps
- Sample pipeline deals

Run: `npm run seed` from the `server/` directory.

---

## Lead Scoring Logic

| Event | Score Delta |
|-------|-------------|
| Email opened | +10 |
| Link clicked | +20 |
| Meeting booked | +50 |
| Status → hot threshold | ≥ 60 |

---

## License

MIT

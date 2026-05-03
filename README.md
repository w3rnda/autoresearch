# LeadFlow CRM + GTM Engine

A self-hosted, AI-powered Go-To-Market platform that combines a full-featured CRM with an automated lead-sourcing engine. **Discover, deduplicate, enrich, score, and convert leads end-to-end** — without paying for ZoomInfo, Apollo, or Clay.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GTM Engine Pipeline                           │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │  SOURCE  │───▶│  DEDUP   │───▶│ ENRICH   │───▶│  SCORE   │     │
│  │          │    │          │    │          │    │          │     │
│  │ Apify    │    │ placeId  │    │ Waterfall│    │ AI Score │     │
│  │ Google   │    │ domain   │    │ rawData  │    │ (Claude) │     │
│  │ Maps     │    │ name+city│    │ website  │    │          │     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                        │            │
│                                                        ▼            │
│                                              ┌──────────────┐      │
│                                              │   PROMOTE    │      │
│                                              │              │      │
│                                              │ GtmEntity →  │      │
│                                              │  CRM Lead    │      │
│                                              └──────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ What's Inside

### 🎯 GTM Engine (NEW)
- **Multi-source sourcing** — Apify Google Maps integration, MCP-native, extensible to LinkedIn, Crunchbase, BuiltWith
- **3-strategy deduplication** — `placeId` → `domain` → `name+city` fuzzy match (100% accuracy verified)
- **Waterfall enrichment** — Progressive fill from rawData → domain → contact extraction → AI inference
- **ICP-based workspaces** — Define ideal customers in natural language, multiple workspaces per organization
- **Auto-promotion to leads** — Threshold-based promotion with sequence auto-enrollment
- **Full audit trail** — `SourcingRun`, `EnrichmentLog`, `EntitySnapshot`, `Signal` models
- **Background workers** — BullMQ + Redis with retry, backoff, rate limiting

### 📋 Full CRM
- **Lead management** — CRUD, CSV import with smart column mapping, custom fields catch-all
- **Pipeline (Kanban)** — Drag-and-drop deal management
- **Email sequences** — Multi-step automation with open/click tracking
- **Meetings** — Public booking links + availability management
- **Quotes & invoices** — PDF generation
- **Multi-tenancy** — Organization-scoped JWT auth

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- Git
- (Optional) [Apify](https://apify.com) account for live Google Maps sourcing — $5 free credit

### 1. Clone

```bash
git clone https://github.com/w3rnda/autoresearch.git
cd autoresearch/leadflow-crm
```

### 2. Configure (optional but recommended)

```bash
# Create .env in leadflow-crm/ for Apify integration
echo "APIFY_API_TOKEN=apify_api_your_token_here" > .env
```

### 3. Launch

```bash
docker-compose up --build -d
```

### 4. Access

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| Backend API | http://localhost:3001/api/v1 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

**Demo login:** `admin@demo.com` / `password123`

---

## 🎬 GTM Engine — End-to-End Walkthrough

### Workflow

```
1. Create workspace (define ICP)
   ↓
2. Trigger sourcing (Apify Google Maps)
   ↓
3. Auto-dedup against existing entities
   ↓
4. Workers enrich entities (waterfall pipeline)
   ↓
5. AI scores each entity (Phase 2)
   ↓
6. Promote top entities → CRM Leads
   ↓
7. Leads enter pipeline + email sequences
```

### Try It Now

In the UI, navigate to **GTM Engine → GTM Workspaces** in the sidebar:

1. Click **"New Workspace"**
2. Enter a name (e.g., "Miami Restaurants")
3. Add search queries (one per line):
   ```
   restaurants in Miami FL
   fine dining Miami Beach
   ```
4. Click **"Activate"** to enable scheduled sourcing
5. Click **"Run Search"** to trigger an immediate Apify run
6. Watch the entities populate (15–100 per query)
7. Click **"Promote"** on top entities to push them to your CRM Leads

### Or via API

```bash
# Login
TOKEN=$(curl -s http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' \
  | jq -r '.data.accessToken')

# Create workspace
WS_ID=$(curl -s http://localhost:3001/api/v1/gtm/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lagos Dental Clinics",
    "icpNatural": "Dental clinics with 4+ stars and active websites",
    "sourcingConfig": {
      "sources": ["google_maps"],
      "queries": ["dental clinics Lagos Nigeria"]
    }
  }' | jq -r '.data.id')

# Trigger sourcing (requires APIFY_API_TOKEN)
curl -s -X POST http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/source \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"dental clinics Lagos Nigeria","maxResults":50}'

# Or ingest pre-scraped data (no Apify token needed)
curl -s -X POST http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @lagos-dental-entities.json

# List discovered entities
curl -s http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/entities \
  -H "Authorization: Bearer $TOKEN"

# Promote an entity to a Lead
curl -s -X POST \
  http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/entities/$ENTITY_ID/promote \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🏗️ Architecture

### Multi-Agent Topology

```
                    ┌─────────────────────────────┐
                    │    User (HTTP/UI)            │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Workspace Orchestrator     │
                    │   (gtm-workspace.controller) │
                    └──────────────┬──────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
┌─────────────┐           ┌─────────────┐             ┌─────────────┐
│ Sourcing    │           │ Dedup       │             │ Sourcing    │
│ Agent       │──────────▶│ Service     │────────────▶│ Run Tracker │
│ (Apify)     │           │ (3-strategy)│             │ (audit)     │
└─────────────┘           └─────────────┘             └─────────────┘
       │                           │
       │ FlowProducer chains       ▼
       │                  ┌─────────────────┐
       └─────────────────▶│ Enrichment       │
                          │ Worker (waterfall)│
                          └────────┬─────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ Scoring Agent (Claude API)    │
                    │ Output: { score, reasons,   │
                    │   outreachAngles }           │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ Promotion Agent → CRM Lead   │
                    └─────────────────────────────┘
```

### Data Models

| Model | Purpose |
|-------|---------|
| `GtmWorkspace` | ICP container — natural-language ICP, sourcing/scoring config |
| `GtmEntity` | Raw discovered business — staging before promotion |
| `EntitySnapshot` | Daily snapshot for signal detection (review velocity, etc.) |
| `Signal` | Detected intent signal (review growth, hiring, funding) |
| `EnrichmentLog` | Audit trail of every enrichment step |
| `SourcingRun` | Tracks each sourcing job (status, counts, errors) |
| `Lead` | Promoted entity → full CRM lead with `customFields` JSON catch-all |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Zustand, TanStack Query, Lucide icons |
| Backend | Node.js 20, Express, Prisma ORM, BullMQ |
| Database | PostgreSQL 15 |
| Queue | BullMQ + Redis 7 (FlowProducer for chained jobs) |
| Auth | JWT (15-min access + 7-day refresh) |
| Sourcing | Apify Google Maps Scraper (`compass/crawler-google-places`) |
| Scoring | Claude API via `@anthropic-ai/sdk` (Phase 2) |

---

## 📁 Project Structure

```
leadflow-crm/
├── client/                              # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js                # Axios with auth interceptor
│   │   │   ├── leads.api.js
│   │   │   └── gtm.api.js               # NEW — GTM Engine client
│   │   ├── pages/
│   │   │   ├── leads/
│   │   │   ├── pipeline/
│   │   │   └── gtm/                     # NEW — GTM dashboard pages
│   │   │       ├── GtmDashboard.jsx
│   │   │       └── GtmWorkspaceDetail.jsx
│   │   └── components/
│   ├── vite.config.js
│   └── tailwind.config.js
├── server/                              # Express backend
│   ├── prisma/
│   │   └── schema.prisma                # Includes GTM models
│   └── src/
│       ├── controllers/
│       │   ├── leads.controller.js
│       │   └── gtm-workspace.controller.js   # NEW
│       ├── routes/
│       │   ├── leads.routes.js
│       │   └── gtm.routes.js                 # NEW
│       ├── services/
│       │   ├── gtm/
│       │   │   └── dedup.service.js          # NEW — 3-strategy dedup
│       │   └── providers/
│       │       └── apify.provider.js         # NEW — Google Maps scraper
│       ├── queues/
│       │   ├── connection.js                 # NEW — BullMQ + Redis
│       │   ├── sourcing.queue.js             # NEW
│       │   ├── enrichment.queue.js           # NEW
│       │   └── index.js
│       ├── workers/
│       │   ├── email.worker.js
│       │   ├── sourcing.worker.js            # NEW — Apify orchestration
│       │   └── enrichment.worker.js          # NEW — waterfall pipeline
│       └── server.js
├── tests/                               # NEW — Playwright E2E
│   └── gtm-engine.spec.js
├── docker-compose.yml
├── lagos-dental-entities.json           # Demo data (15 real clinics)
├── DEPLOYMENT.md                        # Deploy to Vercel/Railway/Neon
└── README.md
```

---

## 🔌 API Reference

### GTM Engine

Base: `http://localhost:3001/api/v1/gtm`
All endpoints require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/workspaces` | List workspaces |
| `POST` | `/workspaces` | Create workspace |
| `GET`  | `/workspaces/:id` | Get workspace + entity status breakdown |
| `PUT`  | `/workspaces/:id` | Update workspace |
| `DELETE` | `/workspaces/:id` | Delete workspace (cascades) |
| `POST` | `/workspaces/:id/activate` | Activate (queue sourcing jobs) |
| `POST` | `/workspaces/:id/source` | Trigger manual Apify search |
| `POST` | `/workspaces/:id/ingest` | Bypass Apify, accept pre-scraped entities |
| `GET`  | `/workspaces/:id/runs` | List sourcing runs |
| `GET`  | `/workspaces/:id/entities` | List entities with filters |
| `GET`  | `/workspaces/:id/entities/:entityId` | Entity detail with logs/signals |
| `POST` | `/workspaces/:id/entities/:entityId/promote` | Promote entity → Lead |

### CRM Endpoints

Existing endpoints documented at `/api/v1/auth`, `/leads`, `/pipeline`, `/sequences`, `/meetings`, `/quotes`, `/notifications`, `/dashboard`.

---

## 🧪 Testing

### Manual E2E (verified)

| Test | Result |
|------|--------|
| Workspace CRUD | ✅ |
| Apify MCP sourcing | ✅ 15/15 Lagos clinics retrieved |
| 3-strategy dedup | ✅ 0 created on re-ingest |
| Entity → Lead promotion | ✅ 5/5 promoted |
| GTM_ENGINE source visible in CRM | ✅ |
| Status breakdown aggregation | ✅ `{NEW: 10, PROMOTED: 5}` |
| BullMQ retry on Redis disconnect | ✅ |

### Playwright E2E

```bash
cd tests
npx playwright install
npx playwright test
```

Covers: login → create workspace → ingest entities → promote → verify lead in CRM.

---

## 🔐 Environment Variables

### Backend (`server/.env` or docker-compose)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_HOST` | yes (for GTM) | Redis hostname (default: `localhost`) |
| `REDIS_PORT` | no | Redis port (default: `6379`) |
| `JWT_SECRET` | yes | Access token secret (32+ chars) |
| `JWT_REFRESH_SECRET` | yes | Refresh token secret (32+ chars) |
| `JWT_EXPIRES_IN` | no | Access token lifetime (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | no | Refresh token lifetime (default: `7d`) |
| `PORT` | no | API port (default: `3001`) |
| `FRONTEND_URL` | yes | CORS origin |
| `APIFY_API_TOKEN` | optional | Enables live Google Maps sourcing |
| `ANTHROPIC_API_KEY` | optional | Enables AI scoring (Phase 2) |
| `ENABLE_GTM_WORKERS` | optional | Set to `true` to start workers |

### Frontend (`client/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL (default: `http://localhost:3001`) |

---

## 🚢 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for one-click guides:
- Frontend → **Vercel**
- Backend → **Railway** or **Render**
- Database → **Neon** (serverless PostgreSQL)
- Redis → **Upstash** (serverless Redis)

Estimated time-to-live: **~2 hours** for first deploy with all services connected.

---

## 🗺️ Roadmap

### ✅ Phase 1 — Foundation (Done)
- Multi-source sourcing infrastructure
- 3-strategy deduplication
- Workspace CRUD + lifecycle
- Workers for sourcing/enrichment
- CRM integration (entity → lead promotion)

### 🚧 Phase 2 — AI Layer (Next)
- **Claude API scoring** — 0-100 score with reasons + outreach angles
- **Hunter.io email finder** — domain → real decision-maker email
- **Daily snapshots** — track review velocity, hiring signals
- **Auto-promotion** — threshold-based with sequence enrollment

### 🔮 Phase 3 — Intent & Expansion
- LinkedIn job post scraper (hiring signals)
- BuiltWith tech stack detection
- G2/Bombora intent data
- Lookalike search ("find more like my best customer")
- AI-powered outreach generation per entity

### 💼 Phase 4 — Enterprise
- Multi-channel sequences (email + LinkedIn + SMS)
- Webhook system (Zapier/n8n)
- CRM sync (Salesforce/HubSpot)
- Team-based attribution & analytics

---

## 💡 Why This Exists

Traditional GTM tooling is fragmented and expensive:

| Tool | Monthly Cost | Limitation |
|------|--------------|------------|
| ZoomInfo | $1,500–$30k | Static data, expensive seats |
| Apollo | $49–$149/seat | Per-seat pricing scales fast |
| Clay | $149–$800 | Locked into their workflow |
| Gong/Outreach | $100+/seat | Sales engagement only |

**LeadFlow + GTM Engine replaces all of these:**
- Self-hosted, your data
- Pay only for actual API usage (Apify ~$0.01/lead)
- MCP-native — extend to any data source
- Tight CRM integration (not a separate tool)
- Open source, customizable

---

## 📊 Stats from Real Run

Verified with 15 real Lagos dental clinics scraped via Apify Google Maps:

| Metric | Result |
|--------|--------|
| Entities discovered | 15/15 (100%) |
| Names complete | 15/15 (100%) |
| Phone numbers | 14/15 (93%) |
| Websites | 13/15 (87%) |
| placeId unique | 15/15 (100%) |
| Dedup accuracy (re-ingest) | 0 created / 15 duplicates (100%) |
| Promoted to CRM Leads | 5/5 (100%) |

---

## 🤝 Contributing

PRs welcome. Run tests before submitting:

```bash
docker-compose up -d
cd tests && npx playwright test
```

---

## 📜 License

MIT — Use it, fork it, sell it.

---

## 🙏 Credits

Built with [Claude Code](https://claude.com/claude-code), Anthropic's agentic coding tool, leveraging:
- [Apify](https://apify.com) for Google Maps scraping
- [Prisma](https://prisma.io) for the ORM
- [BullMQ](https://bullmq.io) for the queue layer
- [TanStack Query](https://tanstack.com/query) for state management

Demo data sourced from real Lagos businesses via the Apify MCP server.

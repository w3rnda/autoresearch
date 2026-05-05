# How to Use the GTM Engine

A practical guide to using the AI-powered GTM Engine in LeadFlow CRM. Covers everything from "I want to find leads" to "I want a fully automated outbound machine."

---

## TL;DR — The 5-Step Flow

```
1. Open    → http://localhost:5173 (or run start-leadflow.bat)
2. Login   → admin@demo.com / password123
3. Click   → "GTM Engine" in the sidebar
4. Create  → A workspace describing your ideal customer
5. Either:
   ── Click "Run Search" → Apify finds businesses
   ── Or use /ingest API to push data from anywhere
   Then click "Score with AI" → Claude scores them
   Click "Promote" → Top entities become CRM leads
```

That's the whole product. Everything else is configuration, automation, and analytics.

---

## Step 1 — Configure Your API Keys (One-Time)

The GTM Engine has 3 power-ups. **All optional** — the system works without any of them, just with reduced capabilities.

### Apify (data sourcing — strongly recommended)

Without it: you can only ingest pre-scraped data via the `/ingest` API.
With it: every "Run Search" button hits Google Maps live.

```bash
# 1. Sign up: https://apify.com (gives you $5 free credit = ~5,000 lookups)
# 2. Get token: https://console.apify.com/account/integrations
# 3. Add to your environment before starting Docker:

# Option A — set system-wide on Windows (PowerShell as admin):
[Environment]::SetEnvironmentVariable('APIFY_API_TOKEN', 'apify_api_xxx', 'User')

# Option B — create leadflow-crm/.env file:
echo "APIFY_API_TOKEN=apify_api_xxx" > leadflow-crm/.env

# Then restart:
docker-compose up -d --force-recreate backend
```

### Anthropic / Claude (AI scoring — the killer feature)

Without it: heuristic rule-based scoring (still useful — based on rating, reviews, contact completeness).
With it: structured AI scoring with personalized outreach angles.

```bash
# 1. Sign up: https://console.anthropic.com
# 2. Get API key: https://console.anthropic.com/settings/keys
# 3. Add to env:
echo "ANTHROPIC_API_KEY=sk-ant-xxx" >> leadflow-crm/.env

# 4. (Optional) override default model:
echo "SCORING_MODEL=claude-haiku-4-5" >> leadflow-crm/.env
# Options: claude-haiku-4-5 (cheapest, recommended), claude-sonnet-4-6 (best quality)

# Restart:
docker-compose up -d --force-recreate backend
```

**Cost**: ~$0.0008 per entity with Haiku. Scoring 1,000 entities = ~$0.80.

### Hunter.io (email finder — for converting domains to real emails)

Without it: pattern guessing (`info@`, `contact@`, `sales@`).
With it: real decision-maker emails sorted by seniority.

```bash
# 1. Sign up: https://hunter.io (25 free searches/month)
# 2. Get API key: https://hunter.io/api-keys
# 3. Add to env:
echo "HUNTER_API_KEY=xxx" >> leadflow-crm/.env

docker-compose up -d --force-recreate backend
```

---

## Step 2 — Create a GTM Workspace

A workspace = one Ideal Customer Profile. Think of it as a folder for one outbound campaign.

### Via UI

1. Sidebar → **GTM Engine** → **GTM Workspaces**
2. Click **New Workspace**
3. Fill in:
   - **Name**: descriptive — `"Lagos Dental Clinics"`, `"Miami Restaurants 4+ stars"`
   - **ICP Description**: plain English — `"Established dental practices in Lagos with active websites, 4+ star ratings, and 100+ reviews"`
   - **Search queries** (one per line):
     ```
     dental clinics Lagos Nigeria
     dentist Victoria Island Lagos
     orthodontist Ikeja Lagos
     ```
4. Click **Create Workspace** → status: `DRAFT`

### Via API

```bash
TOKEN=$(curl -s http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' \
  | jq -r '.data.accessToken')

curl http://localhost:3001/api/v1/gtm/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lagos Dental Clinics",
    "icpNatural": "Established dental practices in Lagos with active websites and 4+ star ratings",
    "sourcingConfig": {
      "sources": ["google_maps"],
      "queries": ["dental clinics Lagos Nigeria", "dentist Victoria Island Lagos"]
    },
    "scoringConfig": {
      "weights": { "fit": 0.4, "signals": 0.3, "quality": 0.3 },
      "thresholds": { "hot": 70, "warm": 40 }
    },
    "autoPromoteThreshold": 80
  }'
```

---

## Step 3 — Source Data

You have 3 ways to get businesses into a workspace.

### Way A: Live Google Maps via Apify (best)

In the workspace detail page, click **Run Search** → enter a query → click **Start Search**.
Within 2-5 minutes, 50-100 businesses populate the Entities table.

### Way B: Bulk Ingest via API (no Apify needed)

If you have data from any source — your own scraper, a CSV, a partner — push it directly:

```bash
curl http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "manual import 2026-Q2",
    "source": "GOOGLE_MAPS",
    "entities": [
      {
        "name": "Optimist Dental",
        "placeId": "ChIJxxx",
        "website": "https://optimistdental.com",
        "phone": "+234 708 165 0482",
        "city": "Lagos",
        "country": "NG",
        "totalScore": 4.9,
        "reviewsCount": 1090,
        "categoryName": "Dental clinic"
      }
    ]
  }'
```

The dedup service runs on every ingest — same `placeId` or `domain` won't duplicate.

### Way C: Activate the Workspace (scheduled sourcing)

Click **Activate** on a workspace → status becomes `ACTIVE` → all queries from `sourcingConfig.queries` are queued immediately.

Future enhancement: cron-scheduled re-runs every N hours.

---

## Step 4 — AI Score the Entities

This is where the magic happens. Claude reads each entity and returns:
- **score** (0-100)
- **fitTier** (HIGH/MEDIUM/LOW)
- **reasons** (1-5 explanation strings)
- **outreachAngles** (1-3 personalized hooks for cold outreach)
- **scoreBreakdown** (fit, signals, quality sub-scores)

### Score Whole Workspace

UI: Click **🧠 Score with AI** in the workspace header.
API:
```bash
curl -X POST http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

The scoring queue processes entities at 10/min (rate-limited to respect Anthropic API).
Refresh the page after a few seconds — you'll see scores populate.

### Score Single Entity

UI: Click **🧠 Score** button on the entity row.
API:
```bash
curl -X POST http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/entities/$ENTITY_ID/score \
  -H "Authorization: Bearer $TOKEN"
```

### Inspect AI Insights

Click the sparkle (✨) icon on the entity row → reveals:
- Score breakdown bars (fit / signals / quality)
- Personalized outreach angles like:
  - *"Lead with their 4.9-star rating — flatter their operational excellence before pitching"*
  - *"Reference their 24/7 hours as a differentiation hook for after-hours patient services"*
  - *"Mention you're focused on Lagos-area dental practices and ask for a 15-min intro call"*

---

## Step 5 — Find Decision-Maker Emails

For any entity that has a domain but no email:

UI: Click **@ Find Emails** on the row.
API:
```bash
curl -X POST http://localhost:3001/api/v1/gtm/workspaces/$WS_ID/entities/$ENTITY_ID/find-emails \
  -H "Authorization: Bearer $TOKEN"
```

Result (with Hunter.io):
```json
{
  "emails": [
    {
      "value": "ceo@dulce247dental.com",
      "type": "personal",
      "confidence": 92,
      "position": "Chief Executive Officer",
      "firstName": "Adaeze",
      "lastName": "Okonkwo",
      "seniority": "executive"
    },
    {
      "value": "info@dulce247dental.com",
      "type": "generic",
      "confidence": 78
    }
  ]
}
```

The top email is auto-saved to the entity. Subsequent calls just retrieve.

Without a Hunter key: returns generic patterns (`info@`, `contact@`, etc.) — still useful as a starting point.

---

## Step 6 — Promote to CRM Leads

### Manual Promotion

UI: Click **▲ Promote** on any entity → it becomes a Lead in your CRM with:
- All Google Maps metadata (rating, reviews, hours, categories)
- Phone, website, location, contact info
- Source = `GTM_ENGINE`
- AI score in `score` field
- All AI insights preserved in `customFields` (reasons, outreachAngles, scoreBreakdown)

### Auto-Promotion (the "set it and forget it" mode)

Set `autoPromoteThreshold` on the workspace (default: not set, manual only):

```bash
curl -X PUT http://localhost:3001/api/v1/gtm/workspaces/$WS_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"autoPromoteThreshold": 75}'
```

Now run **🚀 Score + Auto-Promote** → entities scoring ≥75 automatically become leads. No manual step.

For a **fully autonomous pipeline**, the chain runs end-to-end:

```
Activate workspace
  → Sourcing worker fetches from Apify
    → Dedup auto-checks
      → Enrichment worker auto-runs
        → AUTO_SCORE_AFTER_ENRICH=true (default) queues scoring
          → Scoring worker scores everything
            → autoPromote=true creates leads above threshold
              → New leads visible in /leads page with source=GTM_ENGINE
```

You start a workspace and walk away. Hours later, your CRM has new leads with personalized outreach angles.

---

## Step 7 — Use the Leads

Promoted leads are normal CRM leads — they work with everything:

1. **Pipeline (Kanban)** — Drag through stages (NEW → QUALIFIED → PROPOSAL → WON/LOST)
2. **Email Sequences** — Enroll in multi-step automation. Use `customFields.outreachAngles` as merge variables.
3. **Meetings** — Book demos with calendar integration
4. **Quotes/Invoices** — Generate PDFs

Filter by `source=GTM_ENGINE` to see only the AI-sourced ones:

```bash
curl 'http://localhost:3001/api/v1/leads?source=GTM_ENGINE' \
  -H "Authorization: Bearer $TOKEN"
```

---

## Common Workflows

### "I want to test the system without paying for anything"

1. Use `/ingest` endpoint with the included `lagos-dental-entities.json` (15 real businesses)
2. Skip Apify
3. AI scoring still works — falls back to heuristic mode without ANTHROPIC_API_KEY
4. Email finder still works — falls back to pattern guessing without HUNTER_API_KEY

### "I want a real outbound campaign in 30 minutes"

1. Get APIFY_API_TOKEN ($5 free credit)
2. Create workspace: `"My Target Market"` with 3-5 search queries
3. Click **Run Search** → wait 5 min → 100+ businesses populate
4. Click **Score with AI** → wait 1 min → all scored with outreach angles
5. Set `autoPromoteThreshold: 70` and click **Score + Auto-Promote**
6. Top 30 entities → leads in CRM
7. Create an email sequence using `{{customFields.outreachAngles.0}}` as the personalization
8. Enroll all `GTM_ENGINE` leads → first emails go out

### "I want to find businesses without websites in my city"

1. Run a sourcing query
2. Use entities filter: `?website=null` (manual API call — UI filter coming)
3. These are perfect targets for "we'll build your site" outreach

### "I want to track competitor clients"

1. Search Google Maps for businesses using a competitor (e.g. `"powered by Toast restaurants Miami"`)
2. Score them — they're already paying for software, easier sells
3. Pitch your alternative

### "I want to expand to a new geography"

1. Spin up a workspace per city
2. Same ICP, different `sourcingConfig.queries`
3. Compare workspace stats — see TAM size, average ratings, density

---

## Pricing Summary

| Component | Free tier | Paid scale |
|-----------|-----------|------------|
| LeadFlow CRM | Unlimited (self-hosted) | $0/mo |
| Apify | $5 credit (~5k lookups) | $49/mo (49k lookups) |
| Anthropic Claude | $5 credit | $0.80/1k entities (Haiku) |
| Hunter.io | 25 free/mo | $49/mo (5k searches) |
| **Total at solo scale** | | **~$15/mo** |

vs. ZoomInfo $1,500-$30,000/mo, Apollo $149/seat × 5 = $745/mo, Clay $800/mo.

---

## Troubleshooting

### Scores aren't appearing after clicking "Score with AI"

Check the worker logs:
```bash
docker-compose logs backend --tail 30 | grep SCORING
```

You should see `[SCORING] Worker started` at boot and `[SCORING] Job xxx completed` per entity.
If nothing: verify Redis is healthy (`docker-compose ps`).

### "ANTHROPIC_API_KEY not set" warning

Expected if you haven't configured it. The system uses heuristic fallback — still works, just less smart.
To enable Claude: add to `.env` and restart backend.

### Auto-promotion isn't happening

Check that `autoPromoteThreshold` is set on the workspace:
```bash
curl http://localhost:3001/api/v1/gtm/workspaces/$WS_ID \
  -H "Authorization: Bearer $TOKEN" | jq .data.autoPromoteThreshold
```

If `null`, set it. If set but no promotions: check if any entities scored above threshold.

### Can't find a "Run Search" button

The button only triggers Apify. Without `APIFY_API_TOKEN`, it'll fail.
Use **`/ingest` endpoint** instead with pre-scraped data — covered above.

---

## What's Next

Phase 3 (planned): daily snapshots, signal detection (review velocity, hiring spikes), LinkedIn scraping.

For now, you have a complete, production-grade GTM engine with AI at the core.

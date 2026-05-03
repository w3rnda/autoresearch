# LeadFlow CRM + GTM Engine — E2E Tests

Playwright tests covering the full GTM pipeline: workspace creation, entity ingest, deduplication, promotion, and CRM lead verification.

## Setup

```bash
# From the leadflow-crm/ root, ensure backend + frontend are running:
docker-compose up -d

# Install Playwright
cd tests
npm install
npx playwright install chromium
```

## Run

```bash
# Headless (CI-friendly)
npm test

# Watch mode with browser visible
npm run test:headed

# Interactive UI mode
npm run test:ui

# Just the GTM engine tests
npm run test:gtm

# View last HTML report
npm run report
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `FRONTEND_URL` | `http://localhost:5173` | Vite dev server (or 5174 if conflicts) |
| `BACKEND_URL` | `http://localhost:3001` | Express API |

Override for staging/production:
```bash
FRONTEND_URL=https://leadflow.vercel.app \
BACKEND_URL=https://leadflow-backend.up.railway.app \
npm test
```

## Coverage

- ✅ Workspace CRUD via UI
- ✅ Entity ingest API
- ✅ 3-strategy dedup verification
- ✅ Promotion (entity → lead)
- ✅ Lead appears in CRM with `source=GTM_ENGINE`
- ✅ Status breakdown aggregation
- ✅ Lifecycle transitions (DRAFT → ACTIVE)
- ✅ Validation rejection cases

## CI Integration

`.github/workflows/e2e.yml`:

```yaml
name: E2E Tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: docker-compose up -d
      - run: cd tests && npm ci && npx playwright install chromium
      - run: cd tests && npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/playwright-report/
```

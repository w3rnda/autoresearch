# Deployment Guide — LeadFlow CRM + GTM Engine

This guide deploys the full stack to production using free-tier or low-cost services.

## Recommended Stack

| Component | Service | Tier | Why |
|-----------|---------|------|-----|
| **Frontend** | [Vercel](https://vercel.com) | Free | Auto-deploy from GitHub, edge CDN |
| **Backend API** | [Railway](https://railway.app) | $5/mo starter | Always-on, easy worker support |
| **PostgreSQL** | [Neon](https://neon.tech) | Free | Serverless, branching, generous free tier |
| **Redis** | [Upstash](https://upstash.com) | Free | Serverless Redis, BullMQ-compatible |
| **Apify** | [Apify](https://apify.com) | $5 free credit | Google Maps scraper |

**Total monthly cost: ~$5–10** (vs. $500+ for Apollo/ZoomInfo/Clay)

---

## Step 1: Provision Infrastructure

### 1a. Create Neon PostgreSQL

1. Go to https://neon.tech and sign in with GitHub
2. Create a new project: **leadflow-crm**
3. Copy the **connection string** (looks like `postgresql://user:pass@xx.neon.tech/leadflow?sslmode=require`)

### 1b. Create Upstash Redis

1. Go to https://upstash.com and sign in
2. Create database: **leadflow-redis**
3. Region: pick the closest to your Railway region
4. Copy the **REDIS URL** and the **Endpoint + Port + Password** (you'll need both formats)

### 1c. Create Apify Account (optional but recommended)

1. Go to https://apify.com and sign up
2. Get your API token from https://console.apify.com/account/integrations
3. Test it: visit `https://api.apify.com/v2/users/me?token=YOUR_TOKEN`

---

## Step 2: Deploy Backend to Railway

### 2a. Connect Repo

1. Go to https://railway.app and sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select your fork
3. Set **Root Directory** to `leadflow-crm/server`
4. Railway auto-detects Node.js

### 2b. Set Environment Variables

In Railway → Variables, add:

```
DATABASE_URL=postgresql://...neon.tech/leadflow?sslmode=require
REDIS_HOST=<upstash-endpoint>            # e.g. xxx.upstash.io (NO https://)
REDIS_PORT=<upstash-port>                # usually 6379 or custom
REDIS_PASSWORD=<upstash-password>
JWT_SECRET=<generate 64+ random chars>
JWT_REFRESH_SECRET=<generate 64+ random chars>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-vercel-domain.vercel.app
APIFY_API_TOKEN=apify_api_xxx
ENABLE_GTM_WORKERS=true
```

> **Generate secrets:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### 2c. Update Build Command

In Railway → Settings → Build, set:
- **Build Command:** `npm install && npx prisma generate && npx prisma db push --accept-data-loss`
- **Start Command:** `node src/server.js`

### 2d. Deploy

Click **Deploy**. Watch logs — you should see:
```
[GTM] Workers initialized (sourcing + enrichment)
LeadFlow CRM Server running on port 3001
```

Copy the deployed URL (e.g. `https://leadflow-backend.up.railway.app`).

### 2e. Seed Demo Data (one-time)

```bash
railway run npm run seed
# or via Railway shell
```

---

## Step 3: Deploy Frontend to Vercel

### 3a. Connect Repo

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub fork
3. Set **Root Directory** to `leadflow-crm/client`
4. Framework: **Vite** (auto-detected)

### 3b. Set Environment Variables

```
VITE_API_URL=https://leadflow-backend.up.railway.app
```

### 3c. Deploy

Vercel auto-builds. Copy the URL (e.g. `https://leadflow.vercel.app`).

### 3d. Update Backend CORS

Go back to Railway → set:
```
FRONTEND_URL=https://leadflow.vercel.app
```
Redeploy backend.

---

## Step 4: Verify

1. Open your Vercel URL
2. Login with `admin@demo.com` / `password123`
3. Navigate to **GTM Engine** in sidebar
4. Create a workspace and trigger a search
5. Verify entities appear in the workspace detail page
6. Promote an entity → verify it appears in **Leads** with source `GTM_ENGINE`

---

## Alternative: Deploy to Render (instead of Railway)

If Railway doesn't suit, [Render](https://render.com) works similarly:

1. **New Web Service** → connect repo → root: `leadflow-crm/server`
2. Build command: `npm install && npx prisma generate && npx prisma db push --accept-data-loss`
3. Start command: `node src/server.js`
4. Add same env vars

Free tier sleeps after 15 min of inactivity — fine for demos, not production.

---

## Alternative: Single-Server Deploy (Hetzner/DO/Linode)

For full self-hosting on a $5/mo VPS:

```bash
# On your VPS (Ubuntu 22.04+)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/w3rnda/autoresearch.git
cd autoresearch/leadflow-crm

# Set production env
cat > .env <<EOF
APIFY_API_TOKEN=apify_api_xxx
JWT_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
EOF

# Edit docker-compose.yml — change FRONTEND_URL to your domain
# Add nginx + certbot for HTTPS

docker-compose up -d
```

Add an Nginx reverse proxy with Let's Encrypt for HTTPS:
- Map `crm.yourdomain.com` → `localhost:5173`
- Map `api.yourdomain.com` → `localhost:3001`

---

## Production Checklist

Before going live:

- [ ] Strong random JWT secrets (64+ hex chars)
- [ ] `NODE_ENV=production` everywhere
- [ ] `FRONTEND_URL` set to actual frontend domain
- [ ] Database backup strategy (Neon does daily auto-backup on paid tier)
- [ ] Apify API token is for paid tier if expecting >5k searches/month
- [ ] Rate limiting tuned (default 100 req/15min may be too low)
- [ ] Sentry / error tracking configured
- [ ] HTTPS enforced
- [ ] Change demo admin password (`admin@demo.com`)
- [ ] Disable seeding in production (skip `npm run seed` after first deploy)

---

## Cost Calculator

Monthly cost at different scales:

| Scale | Entities/Month | Apify | Anthropic | Hosting | Total |
|-------|----------------|-------|-----------|---------|-------|
| Solo founder | 1,000 | $5 | ~$5 | $5 | **~$15/mo** |
| Small team | 10,000 | $49 | ~$50 | $20 | **~$120/mo** |
| Mid-market | 100,000 | $499 | ~$500 | $50 | **~$1,050/mo** |

Compare to **ZoomInfo** ($1,500–$30k/mo) or **Apollo** ($149/seat × 5 = $745/mo).

---

## Troubleshooting

### Backend can't connect to Neon

Make sure your `DATABASE_URL` includes `?sslmode=require` at the end.

### Workers not starting

Set `ENABLE_GTM_WORKERS=true` and check Redis connectivity:
```bash
railway run node -e "require('ioredis').createClient({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT, password: process.env.REDIS_PASSWORD }).ping().then(console.log)"
```

### CORS errors on frontend

Verify `FRONTEND_URL` matches your Vercel domain exactly (no trailing slash, correct protocol).

### Prisma migration fails

Use `prisma db push` instead of `prisma migrate deploy` for first-time setup:
```bash
npx prisma db push --accept-data-loss
```

---

## CI/CD (Optional)

GitHub Actions auto-deploy on push to `main`:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Vercel deploy
        run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
      - name: Railway deploy
        run: |
          curl -X POST https://backboard.railway.app/graphql/v2 \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" \
            -d '{"query":"mutation { deploymentTrigger(...) }"}'
```

---

Need help? Open an issue at the repo.

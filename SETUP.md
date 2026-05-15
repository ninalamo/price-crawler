# Setup & Deployment Guide

## Architecture

Three services work together:

```
price-crawler → Supabase DB ← price-api ← price-ui
                    ↑
              (shared database)
```

- **price-crawler** — Scrapes supermarket websites, saves prices to Supabase
- **price-api** — Express REST API that reads from Supabase, serves data to the UI
- **price-ui** — Next.js frontend that calls price-api

---

## Prerequisites

- Node.js 22+
- npm
- A Supabase account (free tier: https://supabase.com)
- A Vercel account (free tier: https://vercel.com)
- A GitHub account (for CI/CD and auto-deploy)

---

## Supabase Setup

1. Go to https://supabase.com and create a project
2. Once created, go to **Project Settings > API**
3. Copy these values:
   - **Project URL** — the `Supabase URL` under "Project Configuration"
   - **Service Role Key** — the `service_role` key under "Project API Keys" (click "Copy")

4. Run the schema SQL from `supabase-schema.sql` (in price-crawler) in Supabase's SQL Editor to create all tables.

---

## Environment Variables

### price-api

| Variable | Where to get it | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL | Same for all services |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > service_role key | **Keep secret** |
| `JWT_SECRET` | Generate with: `openssl rand -base64 32` | Used for auth tokens |
| `CRAWLER_API_KEY` | Any shared secret string | Must match crawler's `API_URL` key |

### price-ui

| Variable | Where to get it | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | The deployed price-api URL + `/api` | e.g. `https://price-api-liart.vercel.app/api` |

### price-crawler

| Variable | Where to get it | Notes |
|---|---|---|
| `SUPABASE_URL` | Same as price-api | Same project |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as price-api | **Keep secret** |
| `API_URL` | The deployed price-api base URL (no `/api`) | Used for notifications, optional |

---

## Vercel Deployment

### price-api

1. Push the repo to GitHub
2. In Vercel: **Add New > Project** → Import the GitHub repo
3. Vercel auto-detects Express — no build config needed
4. In **Settings > Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `CRAWLER_API_KEY`
5. Deploy — the API will be live at `https://<project>.vercel.app`

### price-ui

1. Push the repo to GitHub
2. In Vercel: **Add New > Project** → Import the GitHub repo
3. Vercel auto-detects Next.js — no build config needed
4. In **Settings > Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL` = `https://<your-api>.vercel.app/api`
5. Deploy — the UI will be live at `https://<project>.vercel.app`

### price-crawler

The crawler runs locally or via GitHub Actions — not deployed to Vercel.

---

## GitHub Actions (price-crawler)

The crawler has a scheduled workflow at `.github/workflows/crawl.yml`:

- Runs **daily at 3:00 AM PHT** (19:00 UTC)
- Can be triggered manually from the GitHub Actions tab
- Crawls stores in parallel using a matrix strategy
- Requires a **self-hosted runner** (or switch to `ubuntu-latest` if Playwright works)

**Required GitHub repository secrets** (Settings > Secrets and variables > Actions):

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `API_URL` | Your deployed price-api URL |

To set up a self-hosted runner:
1. Go to GitHub repo > **Settings > Actions > Runners**
2. Click **New self-hosted runner**, select Windows, follow setup instructions

---

## Local Development

### price-api

```bash
cd price-api
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts on port 4000
```

### price-ui

```bash
cd price-ui
npm install
# Create .env.local:
echo NEXT_PUBLIC_API_URL=http://localhost:4000/api > .env.local
npm run dev            # starts on port 3000
```

### price-crawler

```bash
cd price-crawler
npm install
npx playwright install chromium
cp .env.example .env   # fill in your values

# Crawl all stores:
npm run crawl

# Crawl specific stores:
npm run crawl -- --stores sm,metromart

# Options:
#   --stores <names>        sm,shopwise,robinsons,metromart,super8
#   --location <slug>       SM/Savemore location slug
#   --shopwise-branch <id>  Shopwise Pickaroo branch
#   --robinsons-branch <id> Robinsons Pickaroo branch
```

---

## Database Maintenance

### Clear non-user data

```bash
cd price-crawler
npx tsx --env-file=.env clear-db.ts
```

This deletes: `price_history`, `products`, `crawl_sessions`, `categories`.  
**Keeps:** `users`, `stores` (stores are auto-created on crawl).

### Utility Scripts

| Script | Purpose | Command |
|---|---|---|
| `clear-db.ts` | Delete all non-user data | `npx tsx --env-file=.env clear-db.ts` |
| `check-db.ts` | Count products in DB | `npx tsx --env-file=.env check-db.ts` |
| `add-index.ts` | Add DB index for products | `npx tsx --env-file=.env add-index.ts` |

---

## URLs

| Service | Production URL |
|---|---|
| price-api | https://price-api-liart.vercel.app |
| price-ui | https://price-ui-alpha-beryl.vercel.app |
| Supabase Dashboard | https://supabase.com/dashboard/project/ujlxufmgqjspjlcshgsd |

---

## Updating Environment Variables

### Vercel (production)

1. Go to Vercel Dashboard > Project > **Settings > Environment Variables**
2. Add/edit variables
3. Redeploy the project (or push to GitHub to trigger auto-deploy)

### GitHub Actions

1. Go to GitHub repo > **Settings > Secrets and variables > Actions**
2. Add/edit repository secrets
3. The next workflow run picks them up automatically

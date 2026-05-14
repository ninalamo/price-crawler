# PH Price Crawler

Web scraper that crawls Philippine supermarket websites (SM, Shopwise, Robinsons, MetroMart, Super8) and saves product prices to a Supabase database.

## Setup

```bash
npm install
npx playwright install chromium
```

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
API_URL=https://price-api-liart.vercel.app
```

## Usage

```bash
# Crawl all stores
npm run crawl

# Crawl specific stores
npm run crawl -- --stores sm,metromart

# Options
--stores sm,shopwise,robinsons,metromart,super8
--location sm-savemore-commonwealth
--shopwise-branch shopwise-commonwealth
--robinsons-branch robinsons-supermarket-eastwood-technoplaza-ii
```

## Supported Stores

| Name       | --stores value | Platform    |
|------------|----------------|-------------|
| SM Savemore| `sm`           | SM Markets  |
| Shopwise   | `shopwise`     | Pickaroo    |
| Robinsons  | `robinsons`    | Pickaroo    |
| MetroMart  | `metromart`    | MetroMart   |
| Super8     | `super8`       | Super8      |

## Automation (GitHub Actions)

The workflow at `.github/workflows/crawl.yml` runs daily at 3:00 AM PHT.

**Required repository secrets:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_URL`

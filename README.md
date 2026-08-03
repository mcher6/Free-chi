# ChiFree Radar

**Find Chicago’s best free events, pop-ups, giveaways, and appearances.**

ChiFree Radar is a map-first Chicago discovery app that answers two practical questions: what interesting free events are nearby, and which are actually worth attending? It combines allowlisted event-source adapters, explainable free/freebie/notable-person/company classification, deduplication, geocoding, and a transparent 0–100 Radar score.

The MVP includes a polished public experience, local saved events, calendar export, a protected operations page, three real source adapters, SQLite for easy development, and PostgreSQL/Docker deployment support.

> Seed listings are deliberately marked **Demo data** in the database and interface. They exercise the product but are not claims about live events. Always verify availability with the organizer.

## Screenshots

Product screenshots will live in [`docs/screenshots`](docs/screenshots/README.md). The repository already includes a generated Chicago-inspired social preview at [`public/og.png`](public/og.png).

## What is included

- Responsive Leaflet/OpenStreetMap homepage with accessible, attribute-specific markers
- Map, card/list, and calendar-style views
- Shareable URL filters for date, neighborhood, distance, category, free status, freebies, notable guests, companies, registration, family suitability, source, and confidence
- Event cards and details with confidence, supporting evidence, source links, score explanations, save/share, and `.ics` export
- Browser-local saved events—no accounts or personal-data collection
- Protected admin page for source health, event review/correction, source enablement, reruns, and duplicate merges
- Allowlisted scraper with per-domain delays, retries, response limits, SSRF protections, dry runs, source isolation, and a database lease that prevents overlap
- SQLite development schema and PostgreSQL production schema/migration
- Vitest unit/adapter tests and Playwright browser tests that never depend on live third-party pages

## Architecture

The project is intentionally one Next.js repository. Public and admin pages use the same validated event domain; the scraper runs as a CLI/scheduled process rather than as a separate service codebase.

```text
Official allowlisted sources
        │
        ▼
source adapter → Zod validation → normalization/classification → geocode cache
        │                                      │
        └──────── fuzzy dedupe + merge ────────┘
                           │
                           ▼
                 Prisma / PostgreSQL
                    │             │
                    ▼             ▼
             Next.js APIs    scraper health
                    │             │
                    └──────┬──────┘
                           ▼
                map / list / calendar
```

Important boundaries:

- `lib/events/` owns event contracts, classification, validation, deduplication, filtering, and scoring.
- `lib/scraper/adapters/` gives each site its own parser behind `EventSourceAdapter`.
- `config/sources.ts` is the only outbound destination allowlist.
- `lib/server/` and `app/api/` expose safe view-specific DTOs; raw source markup is never returned.
- `prisma/schema.prisma` is SQLite for local work; `prisma/schema.postgresql.prisma` and `prisma/migrations/` are production PostgreSQL.
- `components/` contains the public discovery, detail, saved-event, and admin experiences.

See [`AGENTS.md`](AGENTS.md) for contributor guardrails and [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the implementation plan.

## Local setup

Requirements: Node.js 22.13+ and npm.

```bash
git clone https://github.com/mcher6/Free-chi.git
cd Free-chi
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The seed command loads eight clearly labeled demo scenarios, including a merged duplicate listing, a free concert, library workshop, brand pop-up, food samples, notable-athlete appearance, museum day, and an ambiguous review item.

The local admin page is [http://localhost:3000/admin](http://localhost:3000/admin). Enter the `ADMIN_TOKEN` from `.env`; use a long random token even in shared development environments.

## Environment variables

Copy `.env.example` and change its placeholders.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | `file:./dev.db` locally; PostgreSQL connection URL in production |
| `ADMIN_TOKEN` | Yes for admin | Protects every mutating/admin API; must be at least 12 characters |
| `NEXT_PUBLIC_APP_URL` | Yes in production | Canonical origin used in metadata and calendar links |
| `SCRAPER_CONTACT_EMAIL` | Production scraper | Included in the descriptive scraper user agent |
| `SCRAPER_ENABLED_SOURCES` | No | Optional comma-separated subset of compiled source IDs |
| `SCRAPER_DISABLED_SOURCES` | No | Optional comma-separated source IDs to disable; DB admin controls are also honored |
| `SCRAPER_PUBLISH_THRESHOLD` | No | Free confidence required for automatic publication; default `0.78` |
| `SCRAPER_FREQUENT_SOURCES` | Scheduler | Six-hour source group; default `choose-chicago` |
| `SCRAPER_DAILY_SOURCES` | Scheduler | Daily source group; default `dcase,cpl` |
| `GEOCODER_ENABLED` | No | Set `true` to enable allowlisted Nominatim geocoding for missing coordinates |
| `NOMINATIM_EMAIL` | Recommended | Contact value for geocoding operations where configured |
| `INCLUDE_SEED_FALLBACK` | No | Local resilience only; set `false` in production |

Never commit `.env`. The provided `.gitignore` excludes all environment files except `.env.example`.

## Database setup

Local SQLite:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Production PostgreSQL:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB?schema=public'
npm run db:generate:postgres
npm run db:migrate:deploy
npm run db:seed   # optional demo records; all remain visibly labeled
```

`db:seed` only replaces records where `isSeed=true`; it does not delete scraped production events.

## Running scrapers

Available adapters are `dcase`, `cpl`, and `choose-chicago`.

```bash
npm run scrape
npm run scrape -- --source=dcase
npm run scrape -- --source=cpl
npm run scrape -- --source=choose-chicago --limit=25
npm run scrape -- --dry-run
```

Dry runs print normalized records and do not modify the database. Normal runs continue after a source failure, persist source-level metrics, update previously seen events, merge duplicate evidence/source links, mark expired non-seed listings, and place ambiguous events in review. A 30-minute database lease prevents overlapping workers.

For a long-running Docker host:

```bash
npm run scheduler
```

The scheduler checks frequently changing sources every six hours and ordinary calendars daily. The example [scheduled GitHub Actions workflow](.github/workflows/scrape.yml) is another option when its runner can securely reach the production database. The application does not require a laptop to remain awake.

### Adding a source adapter

1. Confirm the source’s terms and robots guidance, and prefer an official API, feed, iCal, JSON-LD, or embedded structured data over HTML.
2. Add a fixed source entry and exact HTTPS host allowlist in `config/sources.ts`.
3. Implement `EventSourceAdapter` under `lib/scraper/adapters/`.
4. Validate every extracted candidate with `rawEventSchema`; never store raw HTML.
5. Register the adapter and add a sanitized, purpose-built fixture plus offline parser tests.
6. Document its URL, extraction method, supported fields, delay, limitations, and verification date.

Current adapter details are in [`lib/scraper/adapters/README.md`](lib/scraper/adapters/README.md).

## API

All query input is validated. Public responses contain only the fields needed by their view.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/events` | Filtered, sorted, paginated event cards |
| `GET` | `/api/events/:id` | Event detail and similar nearby events |
| `GET` | `/api/events/:id/calendar` | Download one event as iCalendar |
| `GET` | `/api/events/map` | Lightweight markers plus missing-location count |
| `GET` | `/api/neighborhoods` | Featured and discovered neighborhoods |
| `GET` | `/api/sources/status` | Public-safe source health summary |
| `GET` | `/api/health` | Container health probe |
| `GET` | `/api/admin/events` | Protected review queue |
| `PATCH` | `/api/admin/events/:id` | Protected approve/reject/correct/merge operation |
| `POST` | `/api/admin/scrape` | Protected, rate-limited scrape trigger |
| `PATCH` | `/api/admin/sources/:sourceKey` | Protected source enable/disable operation |

Example:

```text
/api/events?datePreset=weekend&neighborhoods=Loop&hasFreebie=true&minimumConfidence=0.8&sort=best&page=1&pageSize=24
```

Admin routes accept `Authorization: Bearer <ADMIN_TOKEN>` or `X-Admin-Token`. Do not place the token in URLs.

## Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium   # first browser-test run only
npm run test:e2e
```

Unit coverage includes Chicago-aware dates, free-event classification, freebie distinctions, notable-person/company evidence, ranking, duplicate and non-duplicate examples, validation, geocoding cache behavior, adapter fixtures, SSRF controls, filtering, and pagination. Playwright covers map discovery, shareable filters, list/calendar views, local saves, event details, calendar export, and a public API request.

## Docker and deployment

Run the full local production topology:

```bash
docker compose up --build
```

This starts PostgreSQL, migrates and serves the Next.js app, and runs the independent scheduler. Replace all default secrets before exposing it.

For Railway, Render, Fly.io, or another Docker-compatible host:

1. Provision PostgreSQL and set the production variables above.
2. Deploy the root `Dockerfile` as the web process (`npm run start`).
3. Run `npm run db:migrate:deploy` during release.
4. Run a second process from the same image with `npm run scheduler`, or use the workflow/host cron to invoke `npm run scrape`.
5. Probe `/api/health` and alert on non-2xx responses, repeated source errors, stale `lastSuccessfulRun`, and growing review/missing-location counts.

Back up PostgreSQL using the host’s managed backups plus periodic `pg_dump`; test restores into a separate database. SQLite `dev.db` is disposable local data and should not be used as a production backup strategy.

## Security, privacy, and scraping ethics

- Public users cannot supply a URL to scrape. Every request and redirect must match an exact compiled HTTPS allowlist.
- Requests reject credentials, private/loopback destinations, nonstandard ports, sensitive forwarded headers, oversized responses, and raw HTML metadata.
- Adapters use a descriptive user agent, per-domain delays, limited retries with exponential backoff, and no authentication/CAPTCHA/paywall bypass.
- Descriptions are reduced to safe plain text before rendering; source HTML is never rendered.
- Admin credentials and database secrets live only in environment variables. API errors/logs avoid secrets.
- Saved events use local storage. The public MVP has no account system and collects no unnecessary personal information.
- Source availability, terms, robots rules, and page structures change. Re-verify an adapter before enabling it in production, remove it when permission is unclear, and link users back to the original organizer.

## Current limitations

- The MVP intentionally starts with three adapters rather than the entire requested source wish list; adapters for Park District, universities, venue calendars, and brand pages remain future work.
- HTML structures can change after their recorded verification date. Offline fixtures prove parser behavior, not that a third party has remained unchanged.
- Nominatim is conservative and optional. Unknown locations remain unpinned instead of being placed at a downtown default.
- Company/notable recognition uses curated watchlists and evidence-aware rules, not a comprehensive global entity database.
- In-memory HTTP rate-limit buckets are per web instance; a multi-instance deployment should move them to Redis or the database.
- Admin-triggered scrapes are detached child processes. Some serverless platforms prohibit this, so use a dedicated scheduler/worker there.

## Recommended next improvements

1. Add official feed/API-first adapters for Chicago Park District, university calendars, and selected institution/brand calendars with fixtures and source-specific monitoring.
2. Add a durable queue plus distributed API rate limiting for multi-instance deployments, while keeping the database scrape lease.
3. Build an admin geocoding/reclassification workflow with venue aliases and neighborhood boundary data for higher location accuracy.

Future-compatible boundaries also leave room for accounts, alerts, personalized recommendations, submissions, newsletters, transit, more cities, and social discovery without expanding this MVP prematurely.

## License and responsibility

No third-party event content is bundled beyond clearly fictionalized/demo seed records and sanitized parser fixtures. Operators are responsible for reviewing source permissions, branding, retention, and attribution before production use.

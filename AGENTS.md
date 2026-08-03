# ChiFree Radar contributor guide

## Project purpose

ChiFree Radar helps people discover worthwhile free events, giveaways, pop-ups,
and notable appearances in Chicago. The public experience should feel like a
local discovery product, not an operations dashboard. Seed records are demo
content and must always remain visibly labeled.

## Architecture

- Next.js App Router with TypeScript and Tailwind CSS.
- Prisma is the data-access layer. SQLite is the zero-setup local default;
  PostgreSQL is used by the production Docker profile.
- `app/` owns routes and route handlers.
- `components/` owns product UI. Browser-only behavior is isolated in client
  components.
- `lib/events/` owns validation, classification, ranking, filtering,
  deduplication, and repository access.
- `lib/scraper/` owns the allowlisted fetcher, source adapters, geocoding,
  normalization, and scrape orchestration.
- `config/` contains source, notable-person, company, and scoring configuration.
- `prisma/` contains the local and production schemas plus seed data.
- Public APIs return view-specific DTOs, never raw extraction HTML.

## Important commands

- `npm run dev` — start the local application.
- `npm run db:setup` — generate the local Prisma client, create SQLite, and seed.
- `npm run scrape -- --dry-run` — parse enabled sources without writing.
- `npm run scrape -- --source=cpl --limit=25` — run one adapter.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
  `npm run build` — required verification.
- `docker compose up --build` — run the PostgreSQL production-like stack.

## Data-source rules

- Fetch only destinations declared in `config/sources.ts`.
- Prefer official APIs, feeds, structured data, then static HTML. Browser
  automation is allowlist-only and a last resort.
- Respect robots.txt, published terms, and configured per-domain delays.
- Never accept a public user-supplied URL for server-side fetching.
- Do not bypass authentication, CAPTCHAs, anti-bot controls, or paywalls.
- Keep sanitized extraction metadata for debugging; never store or render raw
  third-party HTML.
- Source adapters must fail independently so one broken source cannot abort a run.

## Testing expectations

- Every classification or scoring rule needs a focused unit test.
- Adapter tests use sanitized local fixtures, never live third-party pages.
- Deduplication tests must include same-title/different-date nonduplicates.
- API filter tests cover validation, pagination, and combinations.
- Keep at least one Playwright flow for map/list/filter/save/detail behavior.
- Before merging, run lint, typecheck, unit tests, E2E tests, and production build.

## Security rules

- Validate all external inputs and route parameters with Zod.
- Sanitize event descriptions before storage and rendering.
- Keep admin and scrape mutations behind `ADMIN_TOKEN`.
- Store secrets only in environment variables; keep `.env` files ignored.
- Never log authorization headers, database URLs, tokens, or raw source HTML.
- Apply rate limits to public APIs, admin actions, scrapers, and geocoding.
- Do not collect user identities in the public MVP; saved events stay on-device.
- Use parameterized Prisma queries and outbound allowlists to prevent injection
  and SSRF.

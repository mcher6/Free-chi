# Event source adapters

All source destinations are compiled into `config/sources.ts`. Adapters never
accept a public, arbitrary URL. `AllowlistedFetcher` checks the initial request
and every redirect against the selected source's exact HTTPS host allowlist,
rate-limits request starts by domain, limits response size, and retries only
temporary failures.

Adapter fixtures under `tests/fixtures/` are sanitized and purpose-written.
Tests never contact a third-party page.

## Chicago DCASE (`dcase`)

- Source: `https://www.chicago.gov/city/en/depts/dca/provdrs/chicago_festivals.html`
- Method: Event JSON-LD when present, followed by official static event-card
  markup as a fallback.
- Fields: title, description, URL, image, date/time, venue/address,
  neighborhood, coordinates when published, organizer, registration, price,
  categories, and age restrictions.
- Minimum delay: 2 seconds per request start.
- Limitations: DCASE program pages do not use one uniform template. A page that
  publishes only a date in prose will require a dedicated program parser.
- Last verified: 2026-07-29.

## Chicago Public Library (`cpl`)

- Source: `https://chipublib.bibliocommons.com/v2/events`
- Method: server-rendered BiblioCommons event cards, with Event JSON-LD support
  when supplied.
- Fields: title, summary, detail and registration URLs, date/time, branch,
  address, neighborhood, admission text, audience, and event tags.
- Minimum delay: 2 seconds per request start.
- Limitations: the MVP parses the first upcoming results page. A later adapter
  revision should use an officially documented BiblioEvents feed/export if CPL
  exposes one, then add bounded pagination.
- Last verified: 2026-07-29.

## Choose Chicago (`choose-chicago`)

- Source: `https://www.choosechicago.com/events/`
- Method: schema.org Event JSON-LD, with static cards as a fallback.
- Fields: title, description, URL, image, date/time, venue/address,
  coordinates, organizer, structured offers, categories, attendance format,
  and age range.
- Minimum delay: 2.5 seconds per request start.
- Limitations: the calendar includes paid events, so discovery does not imply
  free admission. The domain classification layer must evaluate structured
  offers and text evidence before publication.
- Last verified: 2026-07-29.

## Adding an adapter

1. Add a fixed source and exact host allowlist in `config/sources.ts`.
2. Implement `EventSourceAdapter`; validate every extracted candidate through
   `rawEventSchema`.
3. Store only sanitized metadata—never raw page HTML.
4. Add a sanitized fixture and offline adapter test.
5. Register the adapter in `lib/scraper/adapters/index.ts`.
6. Verify source terms, robots guidance, the extraction method, and the
   configured request delay before enabling it.

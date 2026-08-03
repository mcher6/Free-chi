"use client";

import dynamic from "next/dynamic";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Gift,
  LayoutList,
  LoaderCircle,
  Map,
  MapPinOff,
  Search,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "./app-header";
import { CalendarView } from "./calendar-view";
import { EventCard } from "./event-card";
import {
  DEFAULT_FILTERS,
  type EventFilters,
  type EventsResponse,
  type ViewMode,
  parseEventsResponse,
} from "./event-types";
import { FilterPanel } from "./filter-panel";
import { relativeTime } from "./event-utils";

const EventMap = dynamic(() => import("./event-map").then((module) => module.EventMap), {
  ssr: false,
  loading: () => <div className="map-loading"><LoaderCircle className="spin" size={22} />Loading the Chicago map…</div>,
});

const FALLBACK_NEIGHBORHOODS = [
  "Loop", "South Loop", "West Loop", "River North", "Streeterville", "Gold Coast",
  "Old Town", "Lincoln Park", "Lakeview", "Wrigleyville", "Logan Square",
  "Wicker Park", "Bucktown", "Ukrainian Village", "Hyde Park", "Chinatown",
  "Pilsen", "Bronzeville", "Andersonville", "Uptown", "West Town",
];

const DATE_SHORTCUTS = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["next_7_days", "Next 7 days"],
] as const;

function bool(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const value = params.get(key);
  return value == null ? fallback : value === "true" || value === "1";
}

function fromUrl(params: URLSearchParams): EventFilters {
  return {
    q: params.get("q") || "",
    date: params.get("date") || "",
    from: params.get("from") || "",
    to: params.get("to") || "",
    neighborhood: params.get("neighborhood") || "",
    category: params.get("category") || "",
    source: params.get("source") || "",
    distance: params.get("distance") || "",
    freeOnly: bool(params, "freeOnly", true),
    freeStuff: bool(params, "freeStuff", false),
    notable: bool(params, "notable", false),
    company: bool(params, "company", false),
    registration: bool(params, "registration", false),
    familyFriendly: bool(params, "familyFriendly", false),
    environment: params.get("setting") || "",
    minimumConfidence: params.get("confidence") || "0.65",
    sort: params.get("sort") || "best",
  };
}

type Coordinates = { latitude: number; longitude: number } | null;

function updateUrl(filters: EventFilters, view: ViewMode, location: Coordinates) {
  const params = new URLSearchParams();
  if (view !== "map") params.set("view", view);
  if (filters.q) params.set("q", filters.q);
  if (filters.date) params.set("date", filters.date);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.category) params.set("category", filters.category);
  if (filters.source) params.set("source", filters.source);
  if (filters.distance) params.set("distance", filters.distance);
  if (!filters.freeOnly) params.set("freeOnly", "false");
  if (filters.freeStuff) params.set("freeStuff", "true");
  if (filters.notable) params.set("notable", "true");
  if (filters.company) params.set("company", "true");
  if (filters.registration) params.set("registration", "true");
  if (filters.familyFriendly) params.set("familyFriendly", "true");
  if (filters.environment) params.set("setting", filters.environment);
  if (filters.minimumConfidence !== DEFAULT_FILTERS.minimumConfidence) params.set("confidence", filters.minimumConfidence);
  if (filters.sort !== "best") params.set("sort", filters.sort);
  if (location) {
    params.set("lat", location.latitude.toFixed(5));
    params.set("lng", location.longitude.toFixed(5));
  }
  const query = params.toString();
  window.history.replaceState(null, "", query ? `/?${query}` : "/");
}

function apiParams(filters: EventFilters, location: Coordinates): URLSearchParams {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (filters.q) params.set("search", filters.q);
  if (filters.date) params.set("datePreset", filters.date);
  if (filters.from) params.set("dateFrom", filters.from);
  if (filters.to) params.set("dateTo", filters.to);
  if (filters.neighborhood) params.set("neighborhoods", filters.neighborhood);
  if (filters.category) params.set("categories", filters.category);
  if (filters.source) params.set("sources", filters.source);
  params.set("freeOnly", String(filters.freeOnly));
  if (filters.freeStuff) params.set("hasFreebie", "true");
  if (filters.notable) params.set("hasNotable", "true");
  if (filters.company) params.set("hasCompany", "true");
  if (filters.registration) params.set("registrationRequired", "true");
  if (filters.familyFriendly) params.set("familyFriendly", "true");
  if (filters.environment) params.set("environment", filters.environment);
  if (filters.minimumConfidence) params.set("minimumConfidence", filters.minimumConfidence);
  params.set("sort", filters.sort);
  if (location) {
    params.set("latitude", String(location.latitude));
    params.set("longitude", String(location.longitude));
    if (filters.distance) params.set("distanceMiles", filters.distance);
  }
  return params;
}

function parseNeighborhoods(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (!value || typeof value !== "object") return [];
  const data = (value as Record<string, unknown>).data ?? (value as Record<string, unknown>).neighborhoods;
  if (!Array.isArray(data)) return [];
  return data.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "name" in item ? String(item.name) : "").filter(Boolean);
}

function chips(filters: EventFilters): Array<{ key: keyof EventFilters; label: string }> {
  const values: Array<{ key: keyof EventFilters; label: string }> = [];
  if (filters.from) values.push({ key: "from", label: `From ${filters.from}` });
  if (filters.to) values.push({ key: "to", label: `To ${filters.to}` });
  if (filters.neighborhood) values.push({ key: "neighborhood", label: filters.neighborhood });
  if (filters.category) values.push({ key: "category", label: filters.category });
  if (filters.source) values.push({ key: "source", label: filters.source });
  if (filters.distance) values.push({ key: "distance", label: `Within ${filters.distance} mi` });
  if (filters.freeStuff) values.push({ key: "freeStuff", label: "Free stuff" });
  if (filters.notable) values.push({ key: "notable", label: "Notable guest" });
  if (filters.company) values.push({ key: "company", label: "Major company" });
  if (filters.registration) values.push({ key: "registration", label: "Registration required" });
  if (filters.familyFriendly) values.push({ key: "familyFriendly", label: "Family friendly" });
  return values;
}

export function EventExplorer() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [view, setView] = useState<ViewMode>("map");
  const [response, setResponse] = useState<EventsResponse>({ events: [], total: 0, page: 1, pageSize: 100, totalPages: 1, lastUpdated: null });
  const [neighborhoods, setNeighborhoods] = useState(FALLBACK_NEIGHBORHOODS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [health, setHealth] = useState<{ healthy: boolean; lastRun?: string }>({ healthy: true });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const latitudeValue = params.get("lat");
    const longitudeValue = params.get("lng");
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    const timer = window.setTimeout(() => {
      setFilters(fromUrl(params));
      setView(requestedView === "list" || requestedView === "calendar" ? requestedView : "map");
      if (
        latitudeValue !== null &&
        longitudeValue !== null &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {
        setLocation({ latitude, longitude });
        setLocationState("ready");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void fetch("/api/neighborhoods").then(async (request) => {
      if (!request.ok) throw new Error();
      return request.json() as Promise<unknown>;
    }).then((value) => {
      const parsed = parseNeighborhoods(value);
      if (parsed.length) setNeighborhoods(parsed);
    }).catch(() => undefined);

    void fetch("/api/sources/status").then(async (request) => {
      if (!request.ok) throw new Error();
      return request.json() as Promise<unknown>;
    }).then((value) => {
      if (!value || typeof value !== "object") return;
      const container = value as Record<string, unknown>;
      const data = Array.isArray(container.data) ? container.data : [];
      const unhealthy = data.some((item) => item && typeof item === "object" && (("healthy" in item && item.healthy === false) || ("status" in item && item.status === "error")));
      setHealth({ healthy: !unhealthy, lastRun: typeof container.lastSuccessfulRun === "string" ? container.lastSuccessfulRun : undefined });
    }).catch(() => setHealth({ healthy: false }));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const request = await fetch(`/api/events?${apiParams(filters, location)}`, { signal: controller.signal });
        if (!request.ok) throw new Error();
        setResponse(parseEventsResponse((await request.json()) as unknown));
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("We couldn’t refresh the radar. Please try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, filters.q ? 220 : 30);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, hydrated, location]);

  useEffect(() => {
    if (hydrated) updateUrl(filters, view, location);
  }, [filters, hydrated, location, view]);

  const change = useCallback(<K extends keyof EventFilters>(key: K, value: EventFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
  }

  function reset() {
    setFilters(DEFAULT_FILTERS);
  }

  function locate() {
    if (!navigator.geolocation) { setLocationState("error"); return; }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(next);
      setLocationState("ready");
      setFilters((current) => ({ ...current, distance: current.distance || "5" }));
    }, () => setLocationState("error"), { timeout: 8000 });
  }

  const categories = useMemo(() => [...new Set(response.events.flatMap((event) => event.eventCategories))].sort(), [response.events]);
  const sources = useMemo(() => [...new Set(response.events.map((event) => event.sourceName))].sort(), [response.events]);
  const mapped = response.events.filter((event) => event.latitude != null && event.longitude != null);
  const unlocated = response.events.filter((event) => event.latitude == null || event.longitude == null);
  const featured = [...response.events].sort((a, b) => b.overallScore - a.overallScore).slice(0, 4);
  const active = chips(filters);

  return (
    <div className="app-page">
      <AppHeader />
      <main>
        <section className="discovery-hero">
          <div className="grid-motif" />
          <div className="shell hero-content">
            <span className="hero-kicker"><i />Chicago’s free-event signal</span>
            <h1>Your plans are on us.<span> Chicago is showing up.</span></h1>
            <p>Find Chicago’s best free events, pop-ups, giveaways, and appearances—ranked by what’s genuinely worth your time.</p>
            <div className="hero-search-row">
              <label className="hero-search"><Search size={21} /><span className="sr-only">Search events</span><input type="search" placeholder="Search concerts, pop-ups, people, places…" value={filters.q} onChange={(event) => change("q", event.target.value)} />{filters.q && <button type="button" onClick={() => change("q", "")} aria-label="Clear search"><X size={17} /></button>}</label>
              <button type="button" className={`near-me ${locationState}`} onClick={locate} disabled={locationState === "loading"}>{locationState === "loading" ? <LoaderCircle className="spin" size={18} /> : <Crosshair size={18} />}{locationState === "ready" ? "Near me" : locationState === "error" ? "Location unavailable" : "Use my location"}</button>
            </div>
            <div className="date-shortcuts"><span>When:</span>{DATE_SHORTCUTS.map(([value, label]) => <button type="button" key={value} className={filters.date === value ? "active" : ""} onClick={() => {
              const next = filters.date === value ? "" : value;
              change("date", next);
              if (next) { change("from", ""); change("to", ""); }
            }}>{label}</button>)}<label className="pick-date"><CalendarDays size={15} />Pick a date<input type="date" value={filters.from} onChange={(event) => { change("date", ""); change("from", event.target.value); change("to", event.target.value); }} /></label></div>
          </div>
        </section>

        <section className="shell explorer-shell">
          <div className="explorer-toolbar">
            <div className="toolbar-status"><div><strong>{loading ? "Scanning Chicago…" : `${response.total} events found`}</strong><span>Updated {relativeTime(response.lastUpdated || health.lastRun)}</span></div><span className={`health-pill${health.healthy ? "" : " warning"}`}>{health.healthy ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}{health.healthy ? "Radar healthy" : "Partial coverage"}</span></div>
            <div className="toolbar-controls">
              <button type="button" className="mobile-filter-trigger" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={17} />Filters{active.length > 0 && <b>{active.length}</b>}</button>
              <label className="sort-select"><span className="sr-only">Sort events</span><select value={filters.sort} onChange={(event) => change("sort", event.target.value)}><option value="best">Best overall</option><option value="soonest">Soonest</option><option value="closest">Closest</option><option value="most_notable">Most notable</option><option value="best_freebies">Best freebies</option><option value="newly_discovered">Newly discovered</option></select><ChevronDown size={15} /></label>
              <div className="view-toggle" aria-label="Choose event view">
                {([["map", "Map", <Map size={17} key="map" />], ["list", "List", <LayoutList size={17} key="list" />], ["calendar", "Calendar", <CalendarDays size={17} key="calendar" />]] as Array<[ViewMode, string, React.ReactNode]>).map(([value, label, icon]) => <button type="button" key={value} className={view === value ? "active" : ""} onClick={() => changeView(value)} aria-pressed={view === value}>{icon}<span>{label}</span></button>)}
              </div>
            </div>
          </div>

          {active.length > 0 && <div className="active-filters"><span>Active</span>{active.map((item) => <button type="button" key={item.key} onClick={() => change(item.key, DEFAULT_FILTERS[item.key] as never)}>{item.label}<X size={13} /></button>)}<button type="button" className="clear" onClick={reset}>Clear all</button></div>}

          <div className="explorer-layout">
            <FilterPanel filters={filters} neighborhoods={neighborhoods} categories={categories} sources={sources} mobileOpen={filterOpen} onClose={() => setFilterOpen(false)} onChange={change} onReset={reset} />
            <div className="explorer-content">
              {error && <div className="error-banner" role="alert"><TriangleAlert size={18} />{error}</div>}
              {loading && !response.events.length ? <Loading view={view} /> : !response.events.length ? <Empty onReset={reset} /> : view === "map" ? (
                <>
                  <div className="map-layout"><EventMap events={mapped} selectedId={selectedId} onSelect={setSelectedId} /><aside className="radar-picks"><div className="picks-heading"><div><span>Radar picks</span><h2>Worth leaving home for</h2></div><Sparkles size={19} /></div><div className="featured-list">{featured.map((event) => <EventCard event={event} featured key={event.id} />)}</div></aside></div>
                  {unlocated.length > 0 && <section className="unlocated"><div className="section-heading"><div><span className="eyebrow">Off the map for now</span><h2>Location needs confirmation</h2><p>We won’t guess at a pin. These may still be worth a look.</p></div><MapPinOff size={24} /></div><div className="card-grid">{unlocated.slice(0, 3).map((event) => <EventCard event={event} key={event.id} />)}</div></section>}
                </>
              ) : view === "list" ? (
                <section><div className="section-heading"><div><span className="eyebrow">Chicago, sorted</span><h2>Free plans with a reason to go</h2></div></div><div className="card-grid">{response.events.map((event) => <EventCard event={event} key={event.id} />)}</div></section>
              ) : (
                <section><div className="section-heading"><div><span className="eyebrow">Your free-time forecast</span><h2>What’s happening, day by day</h2></div></div><CalendarView events={response.events} /></section>
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="shell"><div><strong>ChiFree Radar</strong><span>Free plans. Better weekends.</span></div><p>Event details change. Always verify availability with the organizer before heading out.</p></div></footer>
    </div>
  );
}

function Loading({ view }: { view: ViewMode }) {
  return <div className={`loading-state ${view}`} role="status">{view === "map" && <div className="skeleton skeleton-map" />}<div>{[0, 1, 2].map((item) => <div className="skeleton-card" key={item}><div className="skeleton image" /><div className="skeleton line short" /><div className="skeleton line" /><div className="skeleton line medium" /></div>)}</div><span className="sr-only">Scanning for events…</span></div>;
}

function Empty({ onReset }: { onReset: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Gift size={30} /></span><span className="eyebrow">Quiet on this frequency</span><h2>No events match every filter</h2><p>Widen your date or neighborhood. Great free plans sometimes hide one block outside the search.</p><button type="button" className="primary-button" onClick={onReset}>Reset filters</button></div>;
}

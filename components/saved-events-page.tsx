"use client";

import { Bookmark, CalendarPlus, LoaderCircle, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./app-header";
import { EventCard } from "./event-card";
import { parseSingleEvent, type RadarEvent } from "./event-types";
import { downloadIcs } from "./event-utils";
import { useSavedEvents } from "./use-saved-events";

export function SavedEventsPage() {
  const { savedIds, savedCount, clearSaved } = useSavedEvents();
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [query, setQuery] = useState("");
  const [resolvedSignature, setResolvedSignature] = useState("");
  const signature = savedIds.join("|");
  const loading = savedIds.length > 0 && resolvedSignature !== signature;

  useEffect(() => {
    if (!savedIds.length) {
      const timer = window.setTimeout(() => { setEvents([]); setResolvedSignature(""); }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    void Promise.all(savedIds.map((id) => fetch(`/api/events/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async (request) => request.ok ? parseSingleEvent((await request.json()) as unknown) : null).catch(() => null))).then((items) => {
      if (controller.signal.aborted) return;
      setEvents(items.filter((item): item is RadarEvent => Boolean(item)));
      setResolvedSignature(signature);
    });
    return () => controller.abort();
  }, [savedIds, signature]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => [event.title, event.venueName, event.neighborhood, event.sourceName, ...event.eventCategories].filter(Boolean).some((value) => value?.toLowerCase().includes(needle)));
  }, [events, query]);

  return (
    <div className="app-page">
      <AppHeader />
      <main>
        <section className="saved-hero"><div className="shell"><div><span className="hero-kicker"><Bookmark size={14} />Your short list</span><h1>Saved for later.</h1><p>Your Chicago plans stay on this device—no account, tracking, or inbox clutter required.</p></div><div className="saved-stat"><strong>{savedCount}</strong><span>saved event{savedCount === 1 ? "" : "s"}</span></div></div></section>
        <section className="shell saved-content">
          {savedCount > 0 && <div className="saved-toolbar"><label><Search size={18} /><span className="sr-only">Search saved events</span><input type="search" placeholder="Search your saved events" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div><button type="button" className="secondary-button" onClick={() => downloadIcs(events, "chifree-radar-saved-events.ics")} disabled={!events.length}><CalendarPlus size={17} />Export all (.ics)</button><button type="button" className="danger-button" onClick={() => { if (window.confirm("Remove every saved event from this browser?")) clearSaved(); }}><Trash2 size={16} />Clear saved</button></div></div>}
          {loading ? <div className="saved-loading"><LoaderCircle className="spin" size={24} />Loading your saved plans…</div> : savedCount === 0 ? <div className="empty-state saved-empty"><span className="empty-icon"><Bookmark size={29} /></span><span className="eyebrow">Nothing tucked away yet</span><h2>Build a better Chicago weekend</h2><p>Tap the bookmark on any event. It will show up here and stay saved in this browser.</p><Link href="/" className="primary-button">Explore free events</Link></div> : filtered.length === 0 ? <div className="empty-state saved-empty"><span className="eyebrow">No match</span><h2>Nothing saved under “{query}”</h2><button type="button" className="secondary-button" onClick={() => setQuery("")}>Clear search</button></div> : <><div className="saved-results"><h2>{query ? `${filtered.length} matching plan${filtered.length === 1 ? "" : "s"}` : "Your saved plans"}</h2><p>Always recheck details before you head out.</p></div><div className="card-grid">{filtered.map((event) => <EventCard event={event} key={event.id} />)}</div></>}
        </section>
      </main>
    </div>
  );
}

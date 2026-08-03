"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Gift,
  LoaderCircle,
  MapPin,
  Share2,
  ShieldCheck,
  TicketCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./app-header";
import { EventBadges } from "./event-badges";
import { EventCard } from "./event-card";
import { coerceEvent, parseSingleEvent, type Evidence, type RadarEvent } from "./event-types";
import { confidenceLabel, downloadIcs, formatDate, formatTime, locationLine, shareEvent } from "./event-utils";
import { useSavedEvents } from "./use-saved-events";

const EventMap = dynamic(() => import("./event-map").then((module) => module.EventMap), {
  ssr: false,
  loading: () => <div className="detail-map-loading">Loading map…</div>,
});

function unwrap(value: unknown): { event: RadarEvent | null; similar: RadarEvent[] } {
  const event = parseSingleEvent(value);
  if (!value || typeof value !== "object") return { event, similar: [] };
  const raw = Array.isArray((value as Record<string, unknown>).similar) ? (value as Record<string, unknown>).similar as unknown[] : [];
  return { event, similar: raw.map(coerceEvent).filter((item): item is RadarEvent => Boolean(item)) };
}

function matchingEvidence(event: RadarEvent, pattern: RegExp): Evidence[] {
  return event.evidence.filter((item) => pattern.test(`${item.type || ""} ${item.label || ""} ${item.source || ""}`));
}

export function EventDetail() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [event, setEvent] = useState<RadarEvent | null>(null);
  const [similar, setSimilar] = useState<RadarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");
  const { isSaved, toggleSaved } = useSavedEvents();

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void fetch(`/api/events/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (request) => { if (!request.ok) throw new Error(); return request.json() as Promise<unknown>; })
      .then((value) => {
        const result = unwrap(value);
        if (!result.event) throw new Error();
        setEvent(result.event);
        setSimilar(result.similar);
      })
      .catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  const reportUrl = useMemo(() => {
    if (!event) return "#";
    return `mailto:?subject=${encodeURIComponent(`Event correction: ${event.title} (${event.id})`)}&body=${encodeURIComponent(`I found information that may be incorrect:\n\nEvent: ${event.title}\nPage: ${typeof window === "undefined" ? "" : window.location.href}\n\nWhat should be corrected:\n`)}`;
  }, [event]);

  if (loading) return <div className="app-page"><AppHeader /><main className="shell detail-loading"><LoaderCircle className="spin" size={25} /><strong>Checking the signal…</strong></main></div>;
  if (failed || !event) return <div className="app-page"><AppHeader /><main className="shell detail-error"><CircleAlert size={35} /><span className="eyebrow">Signal lost</span><h1>We couldn’t find that event</h1><p>It may have ended, moved, or been removed by its source.</p><Link href="/" className="primary-button"><ArrowLeft size={17} />Back to the radar</Link></main></div>;

  const saved = isSaved(event.id);
  const sources = event.sourceLinks.length ? event.sourceLinks : event.originalEventUrl ? [{ name: event.sourceName, url: event.originalEventUrl }] : [];
  const freeEvidence = matchingEvidence(event, /free|price|admission/i);
  const freebieEvidence = matchingEvidence(event, /freebie|giveaway|sample|food|swag/i);
  const notableEvidence = matchingEvidence(event, /notable|celebrity|speaker|performer|guest/i);
  const companyEvidence = matchingEvidence(event, /company|sponsor|host|brand/i);

  async function share() {
    if (!event) return;
    try { setShareLabel(await shareEvent(event)); window.setTimeout(() => setShareLabel("Share"), 1600); }
    catch { setShareLabel("Try again"); }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main>
        <div className="shell breadcrumbs"><Link href="/"><ArrowLeft size={15} />Explore events</Link><ChevronRight size={14} /><span>{event.eventCategories[0] || "Event"}</span></div>
        <section className="detail-hero">
          <div className="shell detail-hero-inner">
            <div>
              <EventBadges event={event} />
              <h1>{event.title}</h1>
              <p className="detail-lede">{event.shortSummary || "A free Chicago event detected and ranked by ChiFree Radar."}</p>
              <div className="quick-facts">
                <p><CalendarPlus size={18} /><span><strong>{formatDate(event, true)}</strong>{formatTime(event)}</span></p>
                <p><MapPin size={18} /><span><strong>{event.venueName || "Location to be confirmed"}</strong>{[event.address, event.neighborhood].filter(Boolean).join(" · ")}</span></p>
              </div>
              <div className="detail-actions">
                {(event.registrationUrl || event.originalEventUrl) && <a href={event.registrationUrl || event.originalEventUrl || "#"} target="_blank" rel="noreferrer" className="primary-button">{event.registrationRequired ? "Reserve a free spot" : "Check availability"}<ArrowUpRight size={17} /></a>}
                <button type="button" className={`secondary-button${saved ? " saved" : ""}`} onClick={() => toggleSaved(event.id)}>{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{saved ? "Saved" : "Save"}</button>
                <button type="button" className="secondary-button" onClick={() => downloadIcs([event], `${event.id}.ics`)}><CalendarPlus size={17} />Add to calendar</button>
                <button type="button" className="secondary-button" onClick={share}><Share2 size={17} />{shareLabel}</button>
              </div>
            </div>
            <aside className="detail-score-card">
              <span>Radar score</span>
              <div className="score-ring" style={{ "--score": `${Math.max(0, Math.min(100, event.overallScore)) * 3.6}deg` } as React.CSSProperties}><span><strong>{event.overallScore}</strong><small>/100</small></span></div>
              <h2>Why this ranks highly</h2>
              <ul>{(event.rankingReasons.length ? event.rankingReasons : [`${Math.round(event.freeConfidence * 100)}% free-status confidence`, `Trusted listing from ${event.sourceName}`]).slice(0, 4).map((reason) => <li key={reason}><Check size={14} />{reason}</li>)}</ul>
            </aside>
          </div>
        </section>

        {event.isSeed && <div className="shell seed-notice"><BadgeCheck size={18} /><p><strong>This is clearly labeled demo content.</strong> It is seed data for exploring the product and should not be treated as a newly scraped live listing.</p></div>}

        <div className="shell detail-layout">
          <div className="detail-main">
            <section className="detail-section"><span className="eyebrow">The full picture</span><h2>About this event</h2><div className="description">{(event.description || event.shortSummary || "The source has not provided a complete description. Check the organizer’s page before making plans.").split(/\n{2,}/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{event.eventCategories.length > 0 && <div className="category-tags">{event.eventCategories.map((category) => <span key={category}>{category}</span>)}</div>}</section>

            <section className="detail-section"><span className="eyebrow">Show the receipts</span><h2>What the radar detected</h2><p className="section-intro">Every label is backed by a confidence score and source evidence, so you can decide for yourself.</p><div className="classification-grid">
              <Classification icon={<TicketCheck size={20} />} tone="free" title="Free status" value={event.freeExplanation || "Listed as free"} confidence={event.freeConfidence} evidence={freeEvidence} />
              <Classification icon={<Gift size={20} />} tone="freebie" title="Free attendee benefit" value={event.freebieDescription || (event.freebieTypes.length ? event.freebieTypes.join(", ") : "No free item detected")} confidence={event.freebieConfidence} evidence={freebieEvidence} empty={!event.freebieDescription && !event.freebieTypes.length} />
              <Classification icon={<UserRound size={20} />} tone="notable" title="Notable people" value={event.celebrityNames.length ? event.celebrityNames.join(", ") : "No notable guest detected"} confidence={event.celebrityConfidence} evidence={notableEvidence} empty={!event.celebrityNames.length} />
              <Classification icon={<Building2 size={20} />} tone="company" title="Company involvement" value={event.companyNames.length ? event.companyNames.join(", ") : "No major company detected"} confidence={event.companyConfidence} evidence={companyEvidence} empty={!event.companyNames.length} />
            </div></section>

            <section className="detail-section"><span className="eyebrow">Where to go</span><h2>{locationLine(event)}</h2>{event.latitude != null && event.longitude != null ? <EventMap events={[event]} compact /> : <div className="missing-map"><MapPin size={25} /><strong>Location needs confirmation</strong><p>We don’t place events at a default downtown pin. Check the source for the latest venue details.</p></div>}<p className="map-address">{[event.venueName, event.address, event.city, event.state, event.postalCode].filter(Boolean).join(", ")}</p></section>
          </div>

          <aside className="detail-sidebar">
            <section className="info-card"><h2>Before you go</h2><dl><div><dt><Clock3 size={16} />Date & time</dt><dd>{formatDate(event, true)}<br />{formatTime(event)}</dd></div><div><dt><TicketCheck size={16} />Admission</dt><dd>{event.priceText || (event.isFree ? "Free" : "Verify price")}<br /><small>{confidenceLabel(event.freeConfidence)}</small></dd></div><div><dt><ShieldCheck size={16} />Registration</dt><dd>{event.registrationRequired ? "Advance RSVP required" : "No registration requirement detected"}</dd></div>{event.ageRestriction && <div><dt><UserRound size={16} />Age</dt><dd>{event.ageRestriction}</dd></div>}</dl><p className="verify-note"><CircleAlert size={16} />Availability, times, and benefits can change. Verify with the organizer before traveling.</p></section>
            <section className="info-card source-card"><h2>Original sources</h2><p>We preserve every listing used to verify and merge this event.</p><div>{sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.name}-${source.url}`}><span><strong>{source.name}</strong><small>Open original listing</small></span><ExternalLink size={16} /></a>)}</div><a href={reportUrl} className="report-link"><CircleAlert size={15} />Report incorrect information</a></section>
          </aside>
        </div>

        {similar.length > 0 && <section className="similar"><div className="shell"><div className="section-heading"><div><span className="eyebrow">Keep exploring</span><h2>Similar events nearby</h2></div><Link href="/">See everything <ArrowUpRight size={16} /></Link></div><div className="card-grid">{similar.slice(0, 3).map((item) => <EventCard event={item} key={item.id} />)}</div></div></section>}
      </main>
    </div>
  );
}

function Classification({ icon, tone, title, value, confidence, evidence, empty = false }: { icon: React.ReactNode; tone: string; title: string; value: string; confidence: number; evidence: Evidence[]; empty?: boolean }) {
  const percent = Math.round(confidence * 100);
  return (
    <article className={`classification tone-${tone}${empty ? " empty" : ""}`}>
      <div className="classification-heading"><span>{icon}</span><div><small>{title}</small><strong>{value}</strong></div></div>
      {!empty && <><div className="confidence-bar"><span style={{ width: `${Math.max(2, percent)}%` }} /></div><div className="confidence-copy"><span>{confidenceLabel(confidence)}</span><strong>{percent}%</strong></div></>}
      {evidence.length > 0 && <details><summary>View classification evidence</summary><ul>{evidence.slice(0, 3).map((item, index) => <li key={`${item.label}-${index}`}><strong>{item.label || "Source signal"}</strong><span>{item.text || item.explanation || "Structured source field"}</span></li>)}</ul></details>}
    </article>
  );
}

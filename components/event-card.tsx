"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Clock3,
  MapPin,
  Share2,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { EventBadges } from "./event-badges";
import type { RadarEvent } from "./event-types";
import { downloadIcs, formatDate, formatTime, locationLine, shareEvent } from "./event-utils";
import { useSavedEvents } from "./use-saved-events";

export function EventCard({ event, featured = false }: { event: RadarEvent; featured?: boolean }) {
  const { isSaved, toggleSaved } = useSavedEvents();
  const [shareLabel, setShareLabel] = useState("Share");
  const saved = isSaved(event.id);
  const href = `/events/${encodeURIComponent(event.id)}`;

  async function share() {
    try {
      setShareLabel(await shareEvent(event));
      window.setTimeout(() => setShareLabel("Share"), 1600);
    } catch {
      setShareLabel("Try again");
    }
  }

  return (
    <article className={`event-card${featured ? " featured-card" : ""}`}>
      <div className="event-visual">
        {event.imageUrl ? (
          // Remote event imagery comes from allowlisted adapters with varying hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="image-fallback" aria-hidden="true">
            <i /> <b>✦</b><span>Chicago, on us.</span>
          </div>
        )}
        <span className="score-chip" aria-label={`Radar score ${event.overallScore} out of 100`}>
          <strong>{event.overallScore}</strong><small>score</small>
        </span>
        {event.isSeed && <span className="demo-ribbon">Demo data</span>}
      </div>
      <div className="event-body">
        <EventBadges event={event} compact />
        <div className="event-title-row">
          <Link href={href}><h3>{event.title}</h3></Link>
          <button
            type="button"
            className={`save-button${saved ? " saved" : ""}`}
            onClick={() => toggleSaved(event.id)}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
          >
            {saved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
          </button>
        </div>
        <div className="event-facts">
          <p><Clock3 size={15} /><span><strong>{formatDate(event)}</strong> · {formatTime(event)}</span></p>
          <p><MapPin size={15} /><span>{locationLine(event)}</span></p>
          {event.distanceMiles != null && <small>{event.distanceMiles.toFixed(1)} mi away</small>}
        </div>
        <p className="event-summary">{event.shortSummary || "A free Chicago event worth knowing about. Open the details to verify the latest information."}</p>
        <div className="free-callout">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{event.freeExplanation || (event.registrationRequired ? "Free with advance registration" : "Listed as free admission")}</strong>
            <small>{event.registrationRequired ? "RSVP may be required" : event.priceText || "No ticket price listed"}</small>
          </div>
        </div>
        {(event.rankingReasons.length > 0 || event.freebieDescription || event.celebrityNames.length > 0) && (
          <div className="why-ranks">
            <Sparkles size={15} />
            <div><span>Why it ranks</span><p>{event.rankingReasons.slice(0, 2).join(" · ") || event.freebieDescription || `${event.celebrityNames.slice(0, 2).join(", ")} is listed to appear`}</p></div>
          </div>
        )}
        <div className="event-footer">
          <span className="source"><i />{event.sourceName}</span>
          <div className="card-actions">
            <button type="button" className="text-action" onClick={() => downloadIcs([event], `${event.id}.ics`)}><CalendarPlus size={14} />Calendar</button>
            <button type="button" className="text-action" onClick={share}><Share2 size={14} />{shareLabel}</button>
            {event.registrationUrl ? (
              <a href={event.registrationUrl} target="_blank" rel="noreferrer" className="card-cta">RSVP <ArrowUpRight size={14} /></a>
            ) : (
              <Link href={href} className="card-cta">Details <ArrowUpRight size={14} /></Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

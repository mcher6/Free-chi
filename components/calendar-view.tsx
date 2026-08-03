import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { EventBadges } from "./event-badges";
import type { RadarEvent } from "./event-types";
import { formatDate, formatTime } from "./event-utils";

export function CalendarView({ events }: { events: RadarEvent[] }) {
  const groups = new Map<string, RadarEvent[]>();
  for (const event of events) {
    const date = new Date(event.startDateTime);
    const key = Number.isNaN(date.getTime()) ? "unknown" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return (
    <div className="calendar-view">
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, dayEvents]) => {
        const date = new Date(dayEvents[0].startDateTime);
        const weekday = Number.isNaN(date.getTime()) ? "TBD" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(date);
        const day = Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/Chicago" }).format(date);
        return (
          <section className="calendar-day" key={key}>
            <div className="calendar-date"><span>{weekday}</span><strong>{day}</strong><small>{formatDate(dayEvents[0])}</small></div>
            <div>
              {dayEvents.map((event) => (
                <article className="calendar-event" key={event.id}>
                  <time>{formatTime(event)}</time>
                  <div className="calendar-main">
                    <EventBadges event={event} compact />
                    <Link href={`/events/${encodeURIComponent(event.id)}`}><h3>{event.title}</h3></Link>
                    <p><MapPin size={14} />{event.venueName || "Location to be confirmed"}{event.neighborhood ? ` · ${event.neighborhood}` : ""}</p>
                  </div>
                  <span className="calendar-score"><strong>{event.overallScore}</strong><small>score</small></span>
                  <Link href={`/events/${encodeURIComponent(event.id)}`} className="calendar-arrow" aria-label={`View ${event.title}`}><ArrowRight size={18} /></Link>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

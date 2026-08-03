import type { RadarEvent } from "./event-types";

const DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Chicago",
});
const DATE_LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Chicago",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

export function formatDate(event: RadarEvent, long = false): string {
  const date = new Date(event.startDateTime);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return (long ? DATE_LONG : DATE).format(date);
}

export function formatTime(event: RadarEvent): string {
  const start = new Date(event.startDateTime);
  if (Number.isNaN(start.getTime())) return "Time to be confirmed";
  const startText = TIME.format(start);
  if (!event.endDateTime) return startText;
  const end = new Date(event.endDateTime);
  return Number.isNaN(end.getTime())
    ? startText
    : `${startText}–${TIME.format(end)}`;
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "not available";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "not available";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function locationLine(event: RadarEvent): string {
  return (
    [event.venueName, event.neighborhood].filter(Boolean).join(" · ") ||
    event.address ||
    "Location to be confirmed"
  );
}

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return "High confidence";
  if (value >= 0.7) return "Good confidence";
  if (value >= 0.5) return "Needs a quick check";
  return "Low confidence";
}

function escapeIcs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function icsDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".000", "");
}

export function createIcs(events: RadarEvent[]): string {
  const created = icsDate(new Date().toISOString());
  const body = events
    .map((event) => {
      const url =
        event.registrationUrl ?? event.originalEventUrl ?? event.sourceUrl ?? "";
      const location = [
        event.venueName,
        event.address,
        event.city,
        event.state,
      ]
        .filter(Boolean)
        .join(", ");
      const description = [
        event.shortSummary ?? event.description ?? "",
        url ? `Details: ${url}` : "",
        "Verify availability and details with the organizer.",
      ]
        .filter(Boolean)
        .join("\n\n");
      return [
        "BEGIN:VEVENT",
        `UID:${escapeIcs(event.id)}@chifreeradar.local`,
        `DTSTAMP:${created}`,
        `DTSTART:${icsDate(event.startDateTime)}`,
        ...(event.endDateTime ? [`DTEND:${icsDate(event.endDateTime)}`] : []),
        `SUMMARY:${escapeIcs(event.title)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        `LOCATION:${escapeIcs(location)}`,
        ...(url ? [`URL:${escapeIcs(url)}`] : []),
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChiFree Radar//EN",
    body,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(
  events: RadarEvent[],
  filename = "chifree-radar-events.ics",
): void {
  if (!events.length) return;
  const href = URL.createObjectURL(
    new Blob([createIcs(events)], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function shareEvent(event: RadarEvent): Promise<string> {
  const url = new URL(`/events/${encodeURIComponent(event.id)}`, window.location.origin).toString();
  if (navigator.share) {
    try {
      await navigator.share({
        title: event.title,
        text: `A free Chicago event from ChiFree Radar: ${event.title}`,
        url,
      });
      return "Shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "Share";
      }
    }
  }
  await navigator.clipboard.writeText(url);
  return "Copied";
}

export function markerKind(event: RadarEvent): {
  icon: string;
  label: string;
  className: string;
} {
  const freebie = event.freebieTypes.length > 0 || event.freebieConfidence >= 0.55;
  const notable = event.celebrityNames.length > 0 || event.celebrityConfidence >= 0.55;
  const company = event.companyNames.length > 0 || event.companyConfidence >= 0.55;
  const count = [freebie, notable, company].filter(Boolean).length;
  if (count >= 2)
    return { icon: "✦", label: "Multiple highlights", className: "marker-multi" };
  if (notable)
    return { icon: "★", label: "Notable guest", className: "marker-notable" };
  if (freebie)
    return { icon: "◆", label: "Free stuff", className: "marker-freebie" };
  if (company)
    return { icon: "C", label: "Major company", className: "marker-company" };
  return { icon: "F", label: "Free event", className: "marker-free" };
}

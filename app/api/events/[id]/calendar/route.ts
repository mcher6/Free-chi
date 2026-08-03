import { type NextRequest } from "next/server";
import { apiError } from "@/lib/server/api-response";
import { getEventById } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return apiError(400, "Invalid event identifier.");
  const event = await getEventById(id);
  if (!event || event.status !== "published") return apiError(404, "Event not found.");
  const end = event.endDateTime ?? new Date(new Date(event.startDateTime).getTime() + 7_200_000).toISOString();
  const location = [event.venueName, event.address, event.city, event.state, event.postalCode].filter(Boolean).join(", ");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ChiFree Radar//Event calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${escapeIcs(`${event.id}@chifree-radar`)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.startDateTime)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(`${event.shortSummary ?? event.description ?? ""}\n\nVerify details: ${event.originalEventUrl}`)}`,
    `LOCATION:${escapeIcs(location)}`,
    `URL:${escapeIcs(`${origin}/events/${event.id}`)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  return new Response(content, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${event.id}.ics"`, "Cache-Control": "private, max-age=300" } });
}

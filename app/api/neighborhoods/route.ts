import { noStoreJson } from "@/lib/server/api-response";
import { getAllEvents } from "@/lib/server/event-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FEATURED = ["Loop", "South Loop", "West Loop", "River North", "Streeterville", "Gold Coast", "Old Town", "Lincoln Park", "Lakeview", "Wrigleyville", "Logan Square", "Wicker Park", "Bucktown", "Ukrainian Village", "Hyde Park", "Chinatown", "Pilsen", "Bronzeville", "Andersonville", "Uptown", "West Town"];
export async function GET() {
  const counts = new Map<string, number>();
  for (const event of await getAllEvents()) if (event.neighborhood) counts.set(event.neighborhood, (counts.get(event.neighborhood) ?? 0) + 1);
  const names = [...FEATURED, ...[...counts.keys()].filter((name) => !FEATURED.includes(name))];
  return noStoreJson({ data: names, neighborhoods: names.map((name) => ({ name, eventCount: counts.get(name) ?? 0 })) });
}

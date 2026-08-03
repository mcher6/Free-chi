import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { isAdminRequest } from "@/lib/server/admin-auth";
import { toEventDto } from "@/lib/server/event-dto";
import { getAllEvents } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.object({ status: z.enum(["review", "published", "rejected", "expired", "all"]).default("review"), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return apiError(401, "A valid administrator token is required.");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "Invalid query parameters.", parsed.error.flatten());
  const all = await getAllEvents({ includeReview: true, includeExpired: true });
  const filtered = parsed.data.status === "all" ? all : all.filter((event) => event.status === parsed.data.status);
  const start = (parsed.data.page - 1) * parsed.data.pageSize;
  const events = filtered.slice(start, start + parsed.data.pageSize).map((event) => toEventDto(event, { detail: true }));
  const totalPages = Math.max(1, Math.ceil(filtered.length / parsed.data.pageSize));
  return noStoreJson({ data: events, events, meta: { ...parsed.data, total: filtered.length, pageCount: totalPages }, ...parsed.data, total: filtered.length, totalPages });
}

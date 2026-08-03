import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { isAdminRequest } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ enabled: z.boolean() }).strict();
export async function PATCH(request: NextRequest, context: { params: Promise<{ sourceKey: string }> }) {
  if (!isAdminRequest(request)) return apiError(401, "A valid administrator token is required.");
  const { sourceKey } = await context.params;
  if (!/^(dcase|cpl|choose-chicago)$/.test(sourceKey)) return apiError(400, "Invalid source key.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid source change.", parsed.error.flatten());
  const source = await prisma.sourceControl.upsert({ where: { sourceKey }, update: { enabled: parsed.data.enabled }, create: { sourceKey, sourceName: sourceKey, enabled: parsed.data.enabled } });
  return noStoreJson({ data: source });
}

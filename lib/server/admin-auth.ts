import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdminRequest(request: NextRequest): boolean {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured || configured.length < 12) return false;
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : request.headers.get("x-admin-token");
  return Boolean(token && safeEqual(token, configured));
}

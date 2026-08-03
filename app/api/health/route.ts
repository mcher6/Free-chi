import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latest = await prisma.scrapeRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    return NextResponse.json({
      status: "ok",
      service: "chifree-radar",
      database: "connected",
      lastSuccessfulScrape: latest?.completedAt?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "chifree-radar",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

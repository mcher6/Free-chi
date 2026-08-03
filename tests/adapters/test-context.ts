import { readFile } from "node:fs/promises";

import {
  getEventSourceConfig,
  type EventSourceId,
} from "../../config/sources";
import type {
  ScrapeContext,
  ScraperLogger,
} from "../../lib/scraper/types";

export const silentLogger: ScraperLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export async function readFixture(name: string): Promise<string> {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

export function fixtureContext(
  sourceId: EventSourceId,
  html: string,
  limit?: number,
): ScrapeContext {
  return {
    source: getEventSourceConfig(sourceId),
    windowStart: new Date("2026-07-29T00:00:00.000Z"),
    windowEnd: new Date("2026-09-27T00:00:00.000Z"),
    limit,
    logger: silentLogger,
    fetchText: async () => html,
  };
}

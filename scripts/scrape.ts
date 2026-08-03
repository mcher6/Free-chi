import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runScrapeCli } from "../lib/scraper/cli";
import type {
  ScrapeEventSink,
  ScrapeRunLock,
  ScrapeRunRecorder,
} from "../lib/scraper/types";

type SinkModule = {
  createScrapeEventSink?: () =>
    | ScrapeEventSink
    | Promise<ScrapeEventSink>;
  createScrapeRunLock?: () => ScrapeRunLock | Promise<ScrapeRunLock>;
  createScrapeRunRecorder?: () =>
    | ScrapeRunRecorder
    | Promise<ScrapeRunRecorder>;
  getDatabaseDisabledSourceIds?: () => Promise<string[]>;
};

interface ScrapeIntegration {
  sink?: ScrapeEventSink;
  lock?: ScrapeRunLock;
  recorder?: ScrapeRunRecorder;
  disabledSourceIds?: string[];
}

async function loadDatabaseIntegration(): Promise<ScrapeIntegration> {
  // This computed import keeps the scraper independently testable while the
  // application data layer provides the production implementation.
  const moduleUrl = new URL(
    "../lib/events/scrape-sink.ts",
    import.meta.url,
  ).href;

  try {
    await access(fileURLToPath(moduleUrl));
  } catch {
    return {};
  }

  // Once the integration file exists, initialization failures are allowed to
  // surface; treating a missing database dependency as "no sink" would hide an
  // operational error.
  const sinkModule = (await import(moduleUrl)) as SinkModule;
  const [sink, lock, recorder, disabledSourceIds] = await Promise.all([
    sinkModule.createScrapeEventSink?.(),
    sinkModule.createScrapeRunLock?.(),
    sinkModule.createScrapeRunRecorder?.(),
    sinkModule.getDatabaseDisabledSourceIds?.(),
  ]);
  return { sink, lock, recorder, disabledSourceIds };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const help = argv.includes("--help") || argv.includes("-h");
  const integration =
    dryRun || help ? {} : await loadDatabaseIntegration();
  const hasExplicitSource = argv.some(
    (argument, index) =>
      argument.startsWith("--source=") ||
      (argument === "--source" && Boolean(argv[index + 1])),
  );
  if (!hasExplicitSource && integration.disabledSourceIds?.length) {
    const configured = (process.env.SCRAPER_DISABLED_SOURCES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    process.env.SCRAPER_DISABLED_SOURCES = [
      ...new Set([...configured, ...integration.disabledSourceIds]),
    ].join(",");
  }
  await runScrapeCli(argv, integration);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";

if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown scraper failure";
    console.error(`Scrape failed: ${message}`);
    process.exitCode = 1;
  });
}

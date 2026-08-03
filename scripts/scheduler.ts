import { isEventSourceId, type EventSourceId } from "../config/sources";
import { main as scrape } from "./scrape";

const SIX_HOURS = 6 * 60 * 60 * 1_000;
const ONE_DAY = 24 * 60 * 60 * 1_000;
process.env.SCRAPE_TRIGGER = "SCHEDULER";

function sourceList(value: string | undefined, fallback: EventSourceId[]) {
  const values = (value ?? fallback.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(isEventSourceId);
  return [...new Set(values)];
}

const frequentSources = sourceList(
  process.env.SCRAPER_FREQUENT_SOURCES,
  ["choose-chicago"],
);
const dailySources = sourceList(
  process.env.SCRAPER_DAILY_SOURCES,
  ["dcase", "cpl"],
);

async function runGroup(label: string, sources: EventSourceId[]) {
  for (const source of sources) {
    try {
      console.log(`[scheduler] starting ${label} source: ${source}`);
      await scrape([`--source=${source}`]);
    } catch (error) {
      console.error(
        `[scheduler] ${source} failed:`,
        error instanceof Error ? error.message : "unknown failure",
      );
    }
  }
}

function repeat(
  label: string,
  sources: EventSourceId[],
  intervalMs: number,
  initialDelayMs: number,
) {
  const execute = () => void runGroup(label, sources);
  setTimeout(() => {
    execute();
    setInterval(execute, intervalMs);
  }, initialDelayMs);
}

console.log(
  `[scheduler] ready; frequent=${frequentSources.join(",") || "none"}; daily=${dailySources.join(",") || "none"}`,
);
repeat("six-hour", frequentSources, SIX_HOURS, 1_000);
repeat("daily", dailySources, ONE_DAY, 90_000);

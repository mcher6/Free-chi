import { isEventSourceId, type EventSourceId } from "../../config/sources";
import type {
  ScrapeEventSink,
  ScrapeRunLock,
  ScrapeRunRecorder,
  ScrapeRunResult,
} from "./types";
import { ScrapeRunner } from "./runner";

export interface ScrapeCliOptions {
  sourceIds?: EventSourceId[];
  dryRun: boolean;
  limit?: number;
  help: boolean;
}

export interface ScrapeCliDependencies {
  runner?: ScrapeRunner;
  sink?: ScrapeEventSink;
  lock?: ScrapeRunLock;
  recorder?: ScrapeRunRecorder;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

export const SCRAPE_CLI_HELP = `ChiFree Radar scraper

Usage:
  npm run scrape
  npm run scrape -- --source=dcase
  npm run scrape -- --source=cpl --limit=25
  npm run scrape -- --dry-run

Options:
  --source=<id>  Run one allowlisted adapter: dcase, cpl, choose-chicago
  --dry-run      Parse and print normalized events without database writes
  --limit=<n>    Process at most 1-500 events per source
  --help         Show this message
`;

export function parseScrapeCliArgs(argv: readonly string[]): ScrapeCliOptions {
  let source: EventSourceId | undefined;
  let dryRun = false;
  let limit: number | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    if (name === "--source") {
      const value = inlineValue ?? argv[++index];
      if (!value || !isEventSourceId(value)) {
        throw new TypeError(
          `Unknown source "${value ?? ""}". Expected dcase, cpl, or choose-chicago.`,
        );
      }
      source = value;
      continue;
    }

    if (name === "--limit") {
      const value = inlineValue ?? argv[++index];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        throw new TypeError("--limit must be an integer from 1 to 500");
      }
      limit = parsed;
      continue;
    }

    throw new TypeError(`Unknown scraper option: ${argument}`);
  }

  return {
    sourceIds: source ? [source] : undefined,
    dryRun,
    limit,
    help,
  };
}

export async function runScrapeCli(
  argv: readonly string[],
  dependencies: ScrapeCliDependencies = {},
): Promise<ScrapeRunResult | null> {
  const options = parseScrapeCliArgs(argv);
  const stdout = dependencies.stdout ?? process.stdout;

  if (options.help) {
    stdout.write(SCRAPE_CLI_HELP);
    return null;
  }

  if (!options.dryRun && !dependencies.sink) {
    throw new TypeError(
      "Database scrape sink is unavailable. Configure lib/events/scrape-sink.ts or run with --dry-run.",
    );
  }

  const runner =
    dependencies.runner ?? new ScrapeRunner({ lock: dependencies.lock });
  const result = await runner.run({
    sourceIds: options.sourceIds,
    dryRun: options.dryRun,
    limit: options.limit,
    sink: dependencies.sink,
  });

  if (!options.dryRun && dependencies.recorder) {
    await dependencies.recorder.record(result);
  }

  if (options.dryRun) {
    stdout.write(
      `${JSON.stringify(
        result.results.flatMap((source) => source.events),
        null,
        2,
      )}\n`,
    );
  } else {
    stdout.write(
      `${JSON.stringify(
        {
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          sources: result.results.map((source) =>
            Object.fromEntries(
              Object.entries(source).filter(([key]) => key !== "events"),
            ),
          ),
        },
        null,
        2,
      )}\n`,
    );
  }

  return result;
}

import {
  getEnabledSourceIds,
  getEventSourceConfig,
  type EventSourceId,
} from "../../config/sources";
import { eventSourceAdapters } from "./adapters";
import { AllowlistedFetcher } from "./fetcher";
import { ConsoleScraperLogger } from "./logger";
import type {
  EventSourceAdapter,
  ScrapeEventSink,
  ScrapeRunLock,
  ScrapeRunResult,
  ScraperLogger,
  SourceScrapeResult,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface ScrapeRunOptions {
  sourceIds?: EventSourceId[];
  dryRun?: boolean;
  limit?: number;
  windowDays?: number;
  signal?: AbortSignal;
  sink?: ScrapeEventSink;
}

export interface ScrapeRunnerDependencies {
  adapters?: ReadonlyMap<EventSourceId, EventSourceAdapter>;
  fetcher?: AllowlistedFetcher;
  logger?: ScraperLogger;
  lock?: ScrapeRunLock;
  now?: () => Date;
}

export class ScrapeAlreadyRunningError extends Error {
  constructor() {
    super("Another scrape run already owns the run lock");
    this.name = "ScrapeAlreadyRunningError";
  }
}

export class ScrapeRunner {
  private readonly adapters: ReadonlyMap<EventSourceId, EventSourceAdapter>;
  private readonly fetcher: AllowlistedFetcher;
  private readonly logger: ScraperLogger;
  private readonly lock?: ScrapeRunLock;
  private readonly now: () => Date;

  constructor(dependencies: ScrapeRunnerDependencies = {}) {
    this.adapters = dependencies.adapters ?? eventSourceAdapters;
    this.logger = dependencies.logger ?? new ConsoleScraperLogger();
    this.fetcher =
      dependencies.fetcher ??
      new AllowlistedFetcher({ logger: this.logger });
    this.lock = dependencies.lock;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: ScrapeRunOptions = {}): Promise<ScrapeRunResult> {
    if (!(options.dryRun ?? false) && !options.sink) {
      throw new TypeError(
        "A ScrapeEventSink is required unless dryRun is enabled",
      );
    }

    if (
      options.limit !== undefined &&
      (!Number.isInteger(options.limit) ||
        options.limit < 1 ||
        options.limit > 500)
    ) {
      throw new TypeError("Scrape limit must be an integer from 1 to 500");
    }

    const windowDays = options.windowDays ?? 60;
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 366) {
      throw new TypeError("Scrape window must be an integer from 1 to 366 days");
    }

    const release = this.lock ? await this.lock.acquire() : undefined;
    if (this.lock && !release) {
      throw new ScrapeAlreadyRunningError();
    }

    const started = this.now();
    const sourceIds = options.sourceIds ?? getEnabledSourceIds();

    try {
      const results = await Promise.all(
        sourceIds.map((sourceId) =>
          this.runSource(sourceId, {
            ...options,
            dryRun: options.dryRun ?? false,
            windowStart: started,
            windowEnd: new Date(started.valueOf() + windowDays * DAY_MS),
          }),
        ),
      );

      return {
        startedAt: started.toISOString(),
        completedAt: this.now().toISOString(),
        dryRun: options.dryRun ?? false,
        results,
      };
    } finally {
      if (release) {
        await release();
      }
    }
  }

  private async runSource(
    sourceId: EventSourceId,
    options: ScrapeRunOptions & {
      dryRun: boolean;
      windowStart: Date;
      windowEnd: Date;
    },
  ): Promise<SourceScrapeResult> {
    const sourceStartedAt = Date.now();
    const adapter = this.adapters.get(sourceId);
    const source = getEventSourceConfig(sourceId);
    const result: SourceScrapeResult = {
      sourceId,
      sourceName: source.sourceName,
      success: false,
      fetched: 0,
      normalized: 0,
      created: 0,
      updated: 0,
      deduplicated: 0,
      unchanged: 0,
      rejected: 0,
      events: [],
      errors: [],
      durationMs: 0,
    };

    if (!adapter) {
      result.errors.push(`No adapter is registered for ${sourceId}`);
      result.durationMs = Date.now() - sourceStartedAt;
      return result;
    }

    this.logger.info("Starting source scrape", { sourceId });

    try {
      const rawEvents = await adapter.fetchEvents({
        source,
        windowStart: options.windowStart,
        windowEnd: options.windowEnd,
        limit: options.limit,
        signal: options.signal,
        logger: this.logger,
        fetchText: (url, fetchOptions) =>
          this.fetcher.fetchText(url, source, fetchOptions),
      });
      result.fetched = rawEvents.length;

      for (const rawEvent of rawEvents) {
        try {
          const event = await adapter.normalizeEvent(rawEvent);
          const validation = adapter.validateEvent(event);
          const start = new Date(event.startDateTime);
          const end = event.endDateTime
            ? new Date(event.endDateTime)
            : start;

          if (!validation.valid) {
            result.rejected += 1;
            result.errors.push(
              `${event.title}: ${validation.errors.join("; ")}`,
            );
            continue;
          }

          if (end < options.windowStart || start > options.windowEnd) {
            result.rejected += 1;
            continue;
          }

          if (validation.warnings.length > 0) {
            this.logger.warn("Normalized event needs attention", {
              sourceId,
              title: event.title,
              warnings: validation.warnings,
            });
          }

          result.normalized += 1;
          result.events.push(event);

          if (!options.dryRun && options.sink) {
            const outcome = await options.sink.upsert(event);
            result[outcome] += 1;
          }
        } catch (error) {
          result.rejected += 1;
          result.errors.push(
            error instanceof Error
              ? error.message
              : "Unknown event normalization failure",
          );
        }
      }

      result.success = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown source failure";
      result.errors.push(message);
      this.logger.error("Source scrape failed", { sourceId, error: message });
    } finally {
      result.durationMs = Date.now() - sourceStartedAt;
      this.logger.info("Completed source scrape", {
        sourceId,
        success: result.success,
        fetched: result.fetched,
        normalized: result.normalized,
        rejected: result.rejected,
        durationMs: result.durationMs,
      });
    }

    return result;
  }
}

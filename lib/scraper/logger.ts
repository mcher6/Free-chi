import type { ScraperLogger } from "./types";

const SENSITIVE_KEY = /(?:authorization|cookie|database|password|secret|token)/i;

export class ConsoleScraperLogger implements ScraperLogger {
  debug(message: string, metadata?: Record<string, unknown>): void {
    if (process.env.SCRAPER_LOG_LEVEL === "debug") {
      this.write("debug", message, metadata);
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.write("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.write("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.write("error", message, metadata);
  }

  private write(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata ? { metadata: redactMetadata(metadata) } : {}),
    };
    const serialized = JSON.stringify(entry);

    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.info(serialized);
    }
  }
}

function redactMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

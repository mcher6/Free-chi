import { describe, expect, it, vi } from "vitest";

import {
  getEnabledSourceIds,
  getEventSourceConfig,
  SCRAPER_USER_AGENT,
} from "../../config/sources";
import {
  AllowlistedFetcher,
} from "../../lib/scraper/fetcher";
import {
  assertAllowedOutboundUrl,
  UnsafeOutboundUrlError,
} from "../../lib/scraper/security";

describe("scraper outbound safety", () => {
  const source = getEventSourceConfig("cpl");

  it("accepts only exact configured HTTPS hosts", () => {
    expect(
      assertAllowedOutboundUrl("/v2/events?page=2", source).toString(),
    ).toBe("https://chipublib.bibliocommons.com/v2/events?page=2");

    for (const unsafe of [
      "http://chipublib.bibliocommons.com/v2/events",
      "https://chipublib.bibliocommons.com.evil.example/v2/events",
      "https://127.0.0.1/",
      "https://user:pass@chipublib.bibliocommons.com/v2/events",
      "https://chipublib.bibliocommons.com:8443/v2/events",
    ]) {
      expect(() => assertAllowedOutboundUrl(unsafe, source)).toThrow(
        UnsafeOutboundUrlError,
      );
    }
  });

  it("revalidates redirects and blocks a redirect to a private host", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    const fetcher = new AllowlistedFetcher({
      fetchImplementation: fetchImplementation as typeof fetch,
      sleep: async () => undefined,
      now: () => 0,
    });

    await expect(
      fetcher.fetchText(source.discoveryUrl, {
        ...source,
        minDelayMs: 0,
        maxRetries: 0,
      }),
    ).rejects.toThrow(UnsafeOutboundUrlError);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("uses a descriptive user agent and retries temporary failures", async () => {
    const waits: number[] = [];
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("temporary", {
          status: 503,
          headers: { "content-type": "text/plain" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    const fetcher = new AllowlistedFetcher({
      fetchImplementation: fetchImplementation as typeof fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      now: () => 0,
      random: () => 0,
    });

    const text = await fetcher.fetchText(source.discoveryUrl, {
      ...source,
      minDelayMs: 0,
      maxRetries: 1,
    });

    expect(text).toBe("<html></html>");
    expect(waits).toEqual([500]);
    const headers = fetchImplementation.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers["User-Agent"]).toBe(SCRAPER_USER_AGENT);
    expect(SCRAPER_USER_AGENT).toContain("ChiFreeRadar");
  });

  it("can disable compiled sources without accepting new destinations", () => {
    expect(
      getEnabledSourceIds({
        NODE_ENV: "test",
        SCRAPER_DISABLED_SOURCES: "cpl, choose-chicago",
      }),
    ).toEqual(["dcase"]);
    expect(
      getEnabledSourceIds({
        NODE_ENV: "test",
        SCRAPER_ENABLED_SOURCES: "cpl,not-a-real-source",
      }),
    ).toEqual(["cpl"]);
  });
});

import { isIP } from "node:net";

import type { SourceConfig } from "../../config/sources";

const PRIVATE_IPV4_RANGES = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.18\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^(?:22[4-9]|23\d)\./,
  /^(?:24\d|25[0-5])\./,
];

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
]);

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

function isPrivateOrReservedIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (version === 4) {
    return PRIVATE_IPV4_RANGES.some((range) => range.test(hostname));
  }

  if (version === 6) {
    const lower = hostname.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("::ffff:")
    );
  }

  return false;
}

/**
 * Resolves relative, adapter-owned links and rejects everything outside the
 * selected source's exact hostname allowlist. This check is also applied to
 * every redirect hop by AllowlistedFetcher.
 */
export function assertAllowedOutboundUrl(
  candidate: string | URL,
  source: Pick<SourceConfig, "discoveryUrl" | "allowedHosts">,
): URL {
  let url: URL;

  try {
    url =
      candidate instanceof URL
        ? new URL(candidate.toString())
        : new URL(candidate, source.discoveryUrl);
  } catch {
    throw new UnsafeOutboundUrlError("Outbound URL is malformed");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError(
      `Outbound protocol is not allowed: ${url.protocol}`,
    );
  }

  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError(
      "Outbound URLs may not contain credentials",
    );
  }

  if (url.port && url.port !== "443") {
    throw new UnsafeOutboundUrlError(
      `Outbound port is not allowed: ${url.port}`,
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = source.allowedHosts.some(
    (allowedHost) => allowedHost.toLowerCase().replace(/\.$/, "") === hostname,
  );

  if (!allowed) {
    throw new UnsafeOutboundUrlError(
      `Outbound host is not allowlisted: ${hostname}`,
    );
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateOrReservedIp(hostname)
  ) {
    throw new UnsafeOutboundUrlError(
      "Private and loopback destinations are not allowed",
    );
  }

  url.hash = "";
  return url;
}

/**
 * Scraper requests must never inherit credentials from callers or framework
 * middleware. Adapters may add harmless content-negotiation headers only.
 */
export function sanitizeOutboundHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
      throw new UnsafeOutboundUrlError(
        `Sensitive outbound header is not allowed: ${name}`,
      );
    }

    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
      throw new UnsafeOutboundUrlError("Outbound headers contain a line break");
    }

    sanitized[name] = value;
  }

  return sanitized;
}

export function safeUrlForLog(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

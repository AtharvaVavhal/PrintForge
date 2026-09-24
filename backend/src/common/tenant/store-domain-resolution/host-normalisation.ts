/**
 * Phase 9 W3 — the storefront-host signal, syntax stage (spec §4.1.2 step 1
 * and §4.2). Pure functions; no I/O. Everything downstream (the CORS
 * predicate in W7, the cached `StoreDomain` lookup, the merchant path in
 * `tenant-context.guard.ts`) keys on the ONE normalised form these produce,
 * so a hostname can never match a row under two spellings.
 *
 * §4.2: lowercase; strip port; strip trailing dot; reject anything that is
 * not a syntactically valid hostname; reject `localhost` / IP literals
 * outside `NODE_ENV=test|development`.
 */

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** `scheme://host[:port]` and NOTHING else — no path, query, fragment or userinfo. */
const ORIGIN = /^(https?):\/\/([^/?#@:\s]+)(?::(\d{1,5}))?$/i;

export interface HostNormalisationOptions {
  /** `true` only under NODE_ENV=test|development (spec §4.2). */
  allowLoopback: boolean;
}

/**
 * Returns the canonical lookup key for a raw hostname, or `null` when the
 * input is not a syntactically valid hostname under the given options.
 */
export function normaliseHost(
  raw: string | undefined | null,
  options: HostNormalisationOptions,
): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let host = raw.trim().toLowerCase();
  if (host.length === 0 || host.length > 253) {
    return null;
  }
  // IPv6 literals are never storefront hosts.
  if (host.startsWith('[') || host.includes(':')) {
    return null;
  }
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  if (host.length === 0) {
    return null;
  }
  if (host === 'localhost' || IPV4.test(host)) {
    return options.allowLoopback ? host : null;
  }
  const labels = host.split('.');
  if (labels.length < 2) {
    return null;
  }
  return labels.every((l) => LABEL.test(l)) ? host : null;
}

export interface ParsedStorefrontOrigin {
  scheme: 'http' | 'https';
  /** Normalised hostname (the lookup key). */
  host: string;
}

export interface OriginParseOptions extends HostNormalisationOptions {
  /** `true` in production (spec §4.1.2 step 1: https only). */
  requireHttps: boolean;
}

/**
 * Parses a browser `Origin` header into `{ scheme, host }` or returns
 * `null` for anything that is not admissible as a storefront origin:
 * absent header, the literal `null`, a value with a path/query/fragment/
 * userinfo, a non-http(s) scheme, `http` where https is required, or a
 * host that fails `normaliseHost`. The port is accepted syntactically but
 * discarded — the lookup key is the hostname alone (§4.2 "strip port").
 */
export function parseStorefrontOrigin(
  origin: string | undefined | null,
  options: OriginParseOptions,
): ParsedStorefrontOrigin | null {
  if (typeof origin !== 'string') {
    return null;
  }
  const match = ORIGIN.exec(origin.trim());
  if (!match) {
    return null;
  }
  const scheme = match[1].toLowerCase() as 'http' | 'https';
  if (options.requireHttps && scheme !== 'https') {
    return null;
  }
  const host = normaliseHost(match[2], options);
  if (host === null) {
    return null;
  }
  return { scheme, host };
}

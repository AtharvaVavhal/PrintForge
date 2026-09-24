import { describe, expect, it } from "vitest";
import { resolveSiteOrigin } from "./siteConfig";

/**
 * Phase 9 W7 (spec §10.1, §14.6; W7 exit gate "No hard-coded `printforge.in`
 * in `siteConfig.ts`") — a static assertion in the style of the backend's own
 * `admin-authorization-coverage.spec.ts` / `platform.guard.spec.ts` guards.
 *
 * The single-store origin assumption is the thing W7 removes: one shared
 * frontend deployment serves every store on its own hostname (⚖️ D8,
 * invariant 11), so a frozen origin constant in the SEO layer would emit one
 * tenant's domain as the canonical URL of every other tenant's pages. This
 * test is what stops it coming back.
 */

/**
 * Every source file in this directory, as raw text. Uses Vite's `?raw` glob
 * rather than `node:fs` — the same mechanism `src/index-csp.test.ts` uses to
 * assert over `index.html`, and the one that works under this project's
 * browser-targeted tsconfig without pulling in Node types.
 */
const SEO_SOURCES = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** This guard file itself — it necessarily names the literal it forbids. */
const SELF = "hostAwareness.test.ts";

/**
 * Block comments, plus line comments whose `//` is NOT preceded by a colon.
 * That exception matters here and nowhere else among this repo's static
 * guards: a naive `//`-to-end-of-line strip would eat the second half of every
 * `https://` URL, which is exactly the text this scan looks for.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function seoSourceFiles(): { name: string; code: string }[] {
  return Object.entries(SEO_SOURCES)
    .map(([path, source]) => ({
      name: path.replace(/^\.\//, ""),
      code: stripComments(source),
    }))
    .filter((f) => f.name !== SELF);
}

describe("frontend host-awareness (Phase 9 W7)", () => {
  it("scans real files (sanity — the scan itself works)", () => {
    const files = seoSourceFiles();
    expect(files.length).toBeGreaterThan(4);
    expect(files.map((f) => f.name)).toContain("siteConfig.ts");
  });

  it("no `printforge.in` literal remains anywhere under src/seo/ (§14.6)", () => {
    const host = "printforge" + ".in";
    const offenders = seoSourceFiles()
      .filter((f) => f.code.includes(host))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("siteConfig no longer exports a frozen SITE_URL / DEFAULT_SITE_URL", async () => {
    const mod = await import("./siteConfig");
    expect(mod).not.toHaveProperty("SITE_URL");
    expect(mod).not.toHaveProperty("DEFAULT_SITE_URL");
    const constants = await import("./siteConfig.constants");
    expect(constants).not.toHaveProperty("DEFAULT_SITE_URL");
  });

  it("the detector would fire on a reintroduced literal (positive control)", () => {
    // Assembled, never contiguous, so this file does not itself contain the
    // literal the scan above forbids.
    const literal = "https://www." + "printforge" + ".in";
    const code = stripComments(
      `const SITE = '${literal}' // a trailing comment`,
    );
    expect(code).toContain(literal);
    expect(code).not.toContain("a trailing comment");
  });

  it("the detector ignores a mention inside a comment (negative control)", () => {
    const host = "printforge" + ".in";
    const code = stripComments(
      `// historical note about ${host}\nexport const A = 1`,
    );
    expect(code).not.toContain(host);
  });
});

describe("resolveSiteOrigin precedence (§10.1)", () => {
  it("prefers the store's canonicalOrigin — the server's own answer", () => {
    expect(resolveSiteOrigin("https://primary.example")).toBe(
      "https://primary.example",
    );
  });

  it("strips a trailing slash so absoluteUrl never doubles it", () => {
    expect(resolveSiteOrigin("https://primary.example/")).toBe(
      "https://primary.example",
    );
  });

  it("falls back to the served host when canonicalOrigin is null (legacy mode)", () => {
    expect(resolveSiteOrigin(null)).toBe(window.location.origin);
  });

  it("treats a blank canonicalOrigin as absent rather than as an empty origin", () => {
    expect(resolveSiteOrigin("   ")).toBe(window.location.origin);
  });

  it("never invents a hostname — the served host is the only default", () => {
    expect(resolveSiteOrigin(null)).not.toContain("printforge" + ".in");
  });
});

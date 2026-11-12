import { matchLinks, patternsFor, type Language } from "./lang.ts";
import type { Registry } from "./registry.ts";
import { isWebUrl, normalize, siteOf, withoutHash } from "./text.ts";
import type { CrawlData } from "./crawl.ts";
import { loaded, pageLinks, unique, type Page, type ScanContext, type Snapshot } from "./sdk.ts";

export interface ContextOptions {
  languages: string[];
  subscriptions: boolean;
  sales: boolean;
}

/** Wraps crawl results with the helpers checks use. Also used by tests to build contexts by hand. */
export function createContext(data: CrawlData, lang: Language, registry: Registry, opts: ContextOptions): ScanContext {
  const byUrl = new Map<string, Page>();
  for (const p of data.pages) {
    for (const u of [p.url, p.js.finalUrl, p.noJs.finalUrl]) {
      if (u && !byUrl.has(withoutHash(u))) byUrl.set(withoutHash(u), p);
    }
  }
  const site = siteOf(new URL(data.url).hostname);
  const page = (u: string | null) => (isWebUrl(u) ? byUrl.get(withoutHash(u)) : undefined);
  // A page belongs to the site by where the load that succeeded ended up, the one with JavaScript first.
  const own = (s: Snapshot) => loaded(s) && siteOf(new URL(s.finalUrl).hostname) === site;
  const observedPages = data.pages.filter((p) => (loaded(p.js) ? own(p.js) : own(p.noJs)));

  const ctx: ScanContext = {
    ...data,
    code: data.code ?? [],
    codeSkipped: data.codeSkipped ?? 0,
    sourceMaps: data.sourceMaps ?? [],
    https: data.url.startsWith("https:"),
    domain: site,
    languages: opts.languages,
    subscriptions: opts.subscriptions,
    sales: opts.sales,
    sitePages: observedPages.filter((p) => loaded(p.js)),
    observedPages,
    jsFailed: observedPages.filter((p) => !loaded(p.js)),
    page,
    links: (concept, from) => matchLinks(lang, concept, Array.isArray(from) ? from : from.links),
    says: (concept, text) => {
      const group = lang.text[concept] ? "text" : "links";
      const t = normalize(text);
      return patternsFor(lang, group, concept).some((re) => re.test(t));
    },
    matches: (concept, text) => {
      const group = lang.text[concept] ? "text" : "links";
      const t = normalize(text);
      const found = patternsFor(lang, group, concept).flatMap((re) => [...t.matchAll(new RegExp(re.source, "gi"))].map((m) => m[0].trim()));
      return [...new Set(found.filter(Boolean))];
    },
    // Whole words only: "meta" is not in "metadaten".
    mentions: (text, phrase) => {
      const p = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !!p && new RegExp(`(^|[^a-z0-9])${p}($|[^a-z0-9])`).test(normalize(text));
    },
    legalPage: (concept) => {
      // Links of the start page's version in a scan language (hreflang) first, then of the start page itself.
      const starts = data.langPage ? [data.langPage, data.start] : [data.start];
      const found = unique(starts.flatMap((p) => ctx.links(concept, pageLinks(p))), (l) => `${l.href}\n${l.label}`).filter((l) => isWebUrl(l.href));
      if (!found.length) return undefined;
      const link = found.find((l) => loaded(page(l.href)?.js)) ?? found[0];
      return { link, page: page(link.href) };
    },
    isThirdParty: (host) => siteOf(host) !== site,
    vendor: (host) => registry.vendor(host),
    trackingCookie: (name) => registry.trackingCookie(name),
    packageVendor: (name) => registry.packageVendor(name),
    vendors: registry.vendors,
    short: (u) => {
      try {
        const parsed = new URL(u);
        return siteOf(parsed.hostname) === site ? parsed.pathname + parsed.search : u;
      } catch {
        return u;
      }
    },
  };
  return ctx;
}

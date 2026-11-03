import { matchLinks, patternsFor, type Language } from "./lang.ts";
import type { Registry } from "./registry.ts";
import { normalize, siteOf, withoutHash } from "./text.ts";
import type { CrawlData } from "./crawl.ts";
import { loaded, type Page, type ScanContext } from "./sdk.ts";

export interface ContextOptions {
  languages: string[];
  subscriptions: boolean;
}

/** Wraps crawl results with the helpers checks use. Also used by tests to build contexts by hand. */
export function createContext(data: CrawlData, lang: Language, registry: Registry, opts: ContextOptions): ScanContext {
  const byUrl = new Map<string, Page>();
  for (const p of data.pages) {
    for (const u of [p.url, p.js.finalUrl, p.noJs.finalUrl]) {
      if (u && !byUrl.has(withoutHash(u))) byUrl.set(withoutHash(u), p);
    }
  }
  const url = data.start.js.finalUrl || data.start.url;
  const site = siteOf(new URL(url).hostname);
  const page = (u: string | null) => (u ? byUrl.get(withoutHash(u)) : undefined);

  const ctx: ScanContext = {
    url,
    languages: opts.languages,
    subscriptions: opts.subscriptions,
    start: data.start,
    pages: data.pages,
    sitePages: data.pages.filter((p) => loaded(p.js) && siteOf(new URL(p.js.finalUrl).hostname) === site),
    http: data.http,
    page,
    links: (concept, snapshot) => matchLinks(lang, concept, snapshot),
    says: (concept, text) => {
      const t = normalize(text);
      return patternsFor(lang, "text", concept).some((re) => re.test(t));
    },
    mentions: (text, phrase) => normalize(text).includes(normalize(phrase)),
    legalPage: (concept) => {
      const found = [...ctx.links(concept, data.start.js), ...ctx.links(concept, data.start.noJs)].filter((l) => l.href);
      if (!found.length) return undefined;
      const link = found.find((l) => loaded(page(l.href)?.js)) ?? found[0];
      return { link, page: page(link.href) };
    },
    isThirdParty: (host) => siteOf(host) !== site,
    vendor: (host) => registry.vendor(host),
    trackingCookie: (name) => registry.trackingCookie(name),
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

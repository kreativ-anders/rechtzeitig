import type { Browser } from "playwright";
import { capture } from "./capture.ts";
import { matchLinks, type Language } from "./lang.ts";
import { countries, emailDns, hostVariant, plainHttp, probe, tlsInfo } from "./probe.ts";
import { blockedInBrowser, isPublicHost } from "./net.ts";
import { siteOf, withoutHash } from "./text.ts";
import type { Area, Page, Probe, ScanContext, Snapshot } from "./sdk.ts";

export interface CrawlOptions {
  browser: Browser;
  lang: Language;
  maxPages: number;
  timeout: number;
  userAgent: string;
  /** Looks up the country of third-party hosts. */
  ipinfoToken?: string;
  /** Tests only: requests to other hosts are recorded, then aborted; no DNS, TLS or HTTP lookups. */
  offline?: boolean;
}

export interface CrawlData {
  start: Page;
  pages: Page[];
  probes: Probe[];
  countries: Record<string, string>;
  http?: ScanContext["http"];
  variant?: ScanContext["variant"];
  tls?: ScanContext["tls"];
  dns?: ScanContext["dns"];
}

const SKIP_FILES = /\.(pdf|zip|gz|dmg|pkg|exe|msi|apk|jpe?g|png|gif|svg|webp|avif|ico|mp3|mp4|webm|xml|json|txt|ics|rss|atom)$/i;
const SAMPLE_ORDER: Area[] = ["nav", "header", "footer", "main", "other", "banner"];
const LEGAL_LINKS_PER_CONCEPT = 2;
const MAX_COUNTRY_LOOKUPS = 30;

const isPage = (href: string | null): href is string => !!href && /^https?:/.test(href) && !SKIP_FILES.test(new URL(href).pathname);

/**
 * Visits the start page, every page a language pack calls a legal page (imprint, privacy, ...),
 * then a sample of same-site pages, up to maxPages. Each page is loaded twice: JavaScript off and on.
 */
export async function crawl(startUrl: string, opts: CrawlOptions): Promise<CrawlData> {
  const settings = { locale: opts.lang.locale, timezoneId: "Europe/Berlin", userAgent: opts.userAgent };
  const noJs = await opts.browser.newContext({ ...settings, javaScriptEnabled: false });
  const js = await opts.browser.newContext(settings);
  // The host the user asked for is trusted, also when it is local (dev servers, test fixtures).
  const input = new URL(startUrl);
  const trusted = input.hostname;
  for (const c of [noJs, js]) {
    await c.route("**", (route) => {
      const u = new URL(route.request().url());
      const allowed = u.host === input.host || (!opts.offline && !blockedInBrowser(u.hostname, trusted));
      return allowed ? route.continue() : route.abort();
    });
  }

  try {
    const visit = async (url: string): Promise<Page> => {
      const [a, b] = await Promise.all([capture(noJs, url, false, opts.timeout), capture(js, url, true, opts.timeout)]);
      return { url, noJs: a, js: b };
    };

    const start = await visit(startUrl);
    const pages = [start];
    const seen = new Set([withoutHash(startUrl), withoutHash(start.js.finalUrl)]);
    const queue = [...legalTargets(start, opts.lang), ...sampleTargets(start.js)];
    for (const url of queue) {
      if (pages.length >= opts.maxPages) break;
      const key = withoutHash(url);
      if (seen.has(key)) continue;
      seen.add(key);
      // Legal pages may live on other domains, but never inside a private network.
      if (!(await isPublicHost(new URL(key).hostname, trusted))) continue;
      pages.push(await visit(key));
    }

    // Lookups without a browser follow the start page only within the same site; otherwise they use the input URL.
    const redirected = start.js.finalUrl || startUrl;
    const finalUrl = siteOf(new URL(redirected).hostname) === siteOf(trusted) ? redirected : startUrl;
    const probes = await probe(new URL(finalUrl).origin, opts.userAgent, opts.timeout, trusted);
    if (opts.offline) return { start, pages, probes, countries: {} };

    const site = siteOf(new URL(finalUrl).hostname);
    const thirdParty = [...new Set(pages.flatMap((p) => [...p.noJs.requests, ...p.js.requests].map((r) => r.host)))]
      .filter((h) => siteOf(h) !== site)
      .slice(0, MAX_COUNTRY_LOOKUPS);
    const [http, variant, tls, dns, found] = await Promise.all([
      plainHttp(finalUrl, opts.timeout, trusted),
      hostVariant(finalUrl, opts.timeout),
      tlsInfo(finalUrl, opts.timeout, trusted),
      emailDns(finalUrl),
      countries(thirdParty, opts.ipinfoToken, opts.timeout),
    ]);
    return { start, pages, probes, countries: found, http, variant, tls, dns };
  } finally {
    await noJs.close();
    await js.close();
  }
}

function legalTargets(start: Page, lang: Language): string[] {
  const urls: string[] = [];
  for (const concept of Object.keys(lang.links)) {
    const hrefs = [...matchLinks(lang, concept, start.js.links), ...matchLinks(lang, concept, start.noJs.links)]
      .map((l) => l.href)
      .filter(isPage);
    urls.push(...[...new Set(hrefs)].slice(0, LEGAL_LINKS_PER_CONCEPT));
  }
  return urls;
}

function sampleTargets(snapshot: Snapshot): string[] {
  const site = siteOf(new URL(snapshot.finalUrl).hostname);
  return snapshot.links
    .filter((l) => isPage(l.href) && siteOf(new URL(l.href).hostname) === site)
    .sort((a, b) => SAMPLE_ORDER.indexOf(a.area) - SAMPLE_ORDER.indexOf(b.area))
    .map((l) => l.href as string);
}

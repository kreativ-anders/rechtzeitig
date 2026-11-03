import type { Browser, BrowserContext } from "playwright";
import { capture } from "./capture.ts";
import { matchLinks, type Language } from "./lang.ts";
import { siteOf, withoutHash } from "./text.ts";
import type { Area, Page, Snapshot } from "./sdk.ts";

export interface CrawlOptions {
  browser: Browser;
  lang: Language;
  maxPages: number;
  timeout: number;
  userAgent: string;
  /** Tests only: requests to other hosts are recorded, then aborted. */
  offline?: boolean;
}

export interface CrawlData {
  start: Page;
  pages: Page[];
  http?: { status: number; location: string } | { error: string };
}

const SKIP_FILES = /\.(pdf|zip|gz|dmg|pkg|exe|msi|apk|jpe?g|png|gif|svg|webp|avif|ico|mp3|mp4|webm|xml|json|txt|ics|rss|atom)$/i;
const SAMPLE_ORDER: Area[] = ["nav", "header", "footer", "main", "other"];
const LEGAL_LINKS_PER_CONCEPT = 2;

/**
 * Visits the start page, every page a language pack calls a legal page (imprint, privacy, ...),
 * then a sample of same-site pages, up to maxPages. Each page is loaded twice: JavaScript off and on.
 */
export async function crawl(startUrl: string, opts: CrawlOptions): Promise<CrawlData> {
  const settings = { locale: opts.lang.locale, timezoneId: "Europe/Berlin", userAgent: opts.userAgent };
  const noJs = await opts.browser.newContext({ ...settings, javaScriptEnabled: false });
  const js = await opts.browser.newContext(settings);
  if (opts.offline) {
    const local = new URL(startUrl).host;
    for (const c of [noJs, js]) {
      await c.route("**", (route) => (new URL(route.request().url()).host === local ? route.continue() : route.abort()));
    }
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
      pages.push(await visit(key));
    }

    const http = opts.offline ? undefined : await plainHttp(start.js.finalUrl || startUrl, opts.timeout);
    return { start, pages, http };
  } finally {
    await noJs.close();
    await js.close();
  }
}

function legalTargets(start: Page, lang: Language): string[] {
  const urls: string[] = [];
  for (const concept of Object.keys(lang.links)) {
    const hrefs = [...matchLinks(lang, concept, start.js), ...matchLinks(lang, concept, start.noJs)]
      .map((l) => l.href)
      .filter((h): h is string => !!h && !SKIP_FILES.test(new URL(h).pathname));
    urls.push(...[...new Set(hrefs)].slice(0, LEGAL_LINKS_PER_CONCEPT));
  }
  return urls;
}

function sampleTargets(snapshot: Snapshot): string[] {
  const site = siteOf(new URL(snapshot.finalUrl).hostname);
  return snapshot.links
    .filter((l) => l.href && siteOf(new URL(l.href).hostname) === site && !SKIP_FILES.test(new URL(l.href).pathname))
    .sort((a, b) => SAMPLE_ORDER.indexOf(a.area) - SAMPLE_ORDER.indexOf(b.area))
    .map((l) => l.href as string);
}

async function plainHttp(url: string, timeout: number): Promise<CrawlData["http"]> {
  const u = new URL(url);
  if (u.protocol !== "https:") return undefined;
  u.protocol = "http:";
  try {
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(timeout) });
    return { status: res.status, location: res.headers.get("location") ?? "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

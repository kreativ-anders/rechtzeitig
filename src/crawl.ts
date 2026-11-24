import type { Browser } from "playwright";
import { capture, CodeCollector } from "./capture.ts";
import { loadYaml } from "./data.ts";
import { LANGUAGES, legalLinkPatterns, loadLanguages, matchLinks, primaryTag, type Language } from "./lang.ts";
import { countries, emailDns, greenHosting, hostVariant, plainHttp, probe, sourceMaps, tlsInfo } from "./probe.ts";
import { isPublicHost, publicAddresses, publicProxy } from "./net.ts";
import { isWebUrl, siteOf, withoutHash } from "./text.ts";
import { LEGAL_CONCEPTS, pageLinks, type Area, type Page, type Probe, type ScanContext, type Snapshot } from "./sdk.ts";

export interface CrawlOptions {
  browser: Browser;
  maxPages: number;
  timeout: number;
  userAgent: string;
  /** Looks up the country of third-party hosts. */
  ipinfoToken?: string;
  /** Asks the Green Web Foundation about the start page's host. */
  greenHosting?: boolean;
  /** Tests only: requests to other hosts are recorded, then aborted; no DNS, TLS or HTTP lookups. */
  offline?: boolean;
  /** false: the host of the start url is not trusted when private or local. src/main.ts sets it on GitHub Actions. */
  allowPrivateUrl?: boolean;
}

export interface CrawlData {
  /** Final URL of the start page. */
  url: string;
  start: Page;
  /** The start page's version in the scan language, when the start page is in another one and announces it via hreflang. */
  langPage?: Page;
  pages: Page[];
  probes: Probe[];
  countries: Record<string, string>;
  http?: ScanContext["http"];
  variant?: ScanContext["variant"];
  tls?: ScanContext["tls"];
  dns?: ScanContext["dns"];
  green?: ScanContext["green"];
  /** Documents and scripts of the loads with JavaScript (ScanContext.code). Missing in hand-built contexts. */
  code?: ScanContext["code"];
  /** URLs of documents and scripts not kept (CodeCollector.skipped), all sites. */
  codeSkipped?: string[];
  sourceMaps?: ScanContext["sourceMaps"];
}

const SKIP_FILES = /\.(pdf|zip|gz|dmg|pkg|exe|msi|apk|jpe?g|png|gif|svg|webp|avif|ico|mp3|mp4|webm|xml|json|txt|ics|rss|atom)$/i;
const SAMPLE_ORDER: Area[] = ["nav", "header", "footer", "main", "other", "banner"];
const CRAWL = loadYaml<{ crawl: { legal_links_per_concept: number } }>("data/thresholds.yml").crawl;
const MAX_COUNTRY_LOOKUPS = 30;
const COUNTDOWN = loadYaml<Record<string, { reload_ms: number; max_pages: number }>>("data/thresholds.yml")["dfa/fake-countdown"];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

const isPage = (href: string | null): href is string => isWebUrl(href) && !SKIP_FILES.test(new URL(href).pathname);

/**
 * Visits the start page, every page a language pack calls a legal page (imprint, privacy, ...),
 * then a sample of same-site pages, up to maxPages. The scan language is German, else English: the start page's own
 * (`<html lang>`), else its version in that language (hreflang) on the same site, which is visited too and whose legal
 * links are read first. Neither: the scan stops. Each page is loaded twice: JavaScript off and on.
 * A page with a running countdown (a timer text that changed between two readings) is loaded a third time in a
 * fresh browser context, for dfa/fake-countdown.
 */
export async function crawl(startUrl: string, opts: CrawlOptions): Promise<CrawlData & { lang: Language }> {
  // The host the user asked for is trusted, also when it is local (dev servers, test fixtures), unless allowPrivateUrl is false.
  const input = new URL(startUrl);
  const trusted = opts.allowPrivateUrl === false ? undefined : input.hostname;
  // Untrusted: a private or local start url stops the scan (BlockedHostError) instead of scanning an error page.
  if (!trusted) await publicAddresses(input.hostname);
  // Every TCP connection of the browser, loopback included, goes through the proxy, which allows only public addresses
  // (WebRTC UDP is off, launchBrowser).
  const proxy = await publicProxy(trusted);
  // The browser asks for German, the preferred scan language.
  const settings = {
    locale: loadLanguages([LANGUAGES[0]]).locale, timezoneId: "Europe/Berlin", userAgent: opts.userAgent,
    proxy: { server: proxy.server, bypass: "<-loopback>" },
    // No downloads; no service workers, so every request passes the proxy and, in tests, the route below.
    acceptDownloads: false, serviceWorkers: "block" as const,
  };
  // Tests: only the fixture host is reached, requests to others are recorded, then aborted.
  const newContext = async (extra: { javaScriptEnabled?: boolean } = {}) => {
    const c = await opts.browser.newContext({ ...settings, ...extra });
    if (opts.offline) await c.route("**", (route) => (new URL(route.request().url()).host === input.host ? route.continue() : route.abort()));
    return c;
  };
  const noJs = await newContext({ javaScriptEnabled: false });
  const js = await newContext();

  const code = new CodeCollector();
  try {
    const visit = async (url: string): Promise<Page> => {
      const [a, b] = await Promise.all([capture(noJs, url, false, opts.timeout), capture(js, url, true, opts.timeout, code)]);
      return { url, noJs: a, js: b };
    };

    const start = await visit(startUrl);
    if (start.js.status === 0 && start.noJs.status === 0) throw new Error(`Could not load ${startUrl}: ${start.js.error ?? start.noJs.error ?? "unknown error"}`);
    const url = start.js.finalUrl || startUrl;
    const pages = [start];
    const seen = new Set([withoutHash(startUrl), withoutHash(url)]);
    // German, else English: the start page's own language, else its version in that language (hreflang).
    const own = [start.js.lang, start.noJs.lang].map(primaryTag);
    let language: string | undefined;
    let langPage: Page | undefined;
    for (const c of LANGUAGES) {
      if (own.includes(c)) {
        language = c;
        break;
      }
      const alternate = hreflangTarget(start, c, seen);
      // Only the same site and only within max-pages: another domain would put a foreign site into every check.
      const sameSite = alternate && siteOf(new URL(alternate).hostname) === siteOf(new URL(url).hostname);
      if (alternate && sameSite && pages.length < opts.maxPages && (await isPublicHost(new URL(alternate).hostname, trusted))) {
        language = c;
        langPage = await visit(alternate);
        pages.push(langPage);
        seen.add(withoutHash(langPage.url));
        if (langPage.js.finalUrl) seen.add(withoutHash(langPage.js.finalUrl));
        break;
      }
    }
    if (!language) {
      const found = (start.noJs.lang || start.js.lang).trim().slice(0, 20);
      throw new Error(`The start page's language is ${found ? `"${found}"` : "not declared"} and it names no German or English version on the same site (hreflang). rechtzeitig checks German or English sites: set url to the German or English page, or declare the language with <html lang> and hreflang.`);
    }
    const lang = loadLanguages([language]);
    const queue = [...(langPage ? legalTargets(langPage, lang) : []), ...legalTargets(start, lang), ...sampleTargets(start.js)];
    for (const url of queue) {
      if (pages.length >= opts.maxPages) break;
      const key = withoutHash(url);
      if (seen.has(key)) continue;
      seen.add(key);
      // Legal pages may live on other domains, but never inside a private network.
      if (!(await isPublicHost(new URL(key).hostname, trusted))) continue;
      pages.push(await visit(key));
    }
    // A countdown that restarts for every visitor ends later in a fresh context: no cookies, no storage.
    for (const page of pages.filter((p) => p.js.timers.some((t) => t.text !== t.later)).slice(0, COUNTDOWN.max_pages)) {
      await sleep(page.js.timers[0].at + COUNTDOWN.reload_ms - Date.now());
      const fresh = await newContext();
      try {
        page.fresh = await capture(fresh, page.url, true, opts.timeout);
      } finally {
        await fresh.close();
      }
    }

    // Lookups without a browser follow the start page only within the same site; otherwise they use the input URL.
    const finalUrl = siteOf(new URL(url).hostname) === siteOf(trusted ?? input.hostname) ? url : startUrl;
    const probes = await probe(new URL(finalUrl).origin, opts.userAgent, opts.timeout, trusted);
    const maps = await sourceMaps(code.files, siteOf(new URL(finalUrl).hostname), opts.userAgent, opts.timeout, trusted);
    const served = { code: code.files, codeSkipped: code.skipped, sourceMaps: maps };
    if (opts.offline) return { lang, url, start, langPage, pages, probes, countries: {}, ...served };

    const site = siteOf(new URL(finalUrl).hostname);
    // The start page's own host too: privacy/third-country falls back to its IP country when data/hosting.yml does not know the provider.
    const thirdParty = [...new Set(pages.flatMap((p) => [...p.noJs.requests, ...p.js.requests].map((r) => r.host)))].filter((h) => siteOf(h) !== site);
    const lookups = [new URL(url).hostname, ...thirdParty].slice(0, MAX_COUNTRY_LOOKUPS);
    const [http, variant, tls, dns, found, green] = await Promise.all([
      plainHttp(finalUrl, opts.timeout, trusted),
      hostVariant(finalUrl, opts.timeout),
      tlsInfo(finalUrl, opts.timeout, trusted),
      emailDns(finalUrl),
      countries(lookups, opts.ipinfoToken, opts.timeout),
      opts.greenHosting ? greenHosting(finalUrl, opts.timeout) : undefined,
    ]);
    return { lang, url, start, langPage, pages, probes, countries: found, http, variant, tls, dns, green, ...served };
  } finally {
    await noJs.close();
    await js.close();
    proxy.close();
  }
}

/**
 * The start page's alternate in language `code` (`<link rel="alternate" hreflang>`), when it points to another
 * page. An exact match ("de") wins over a regional one ("de-AT"); an entry that points to the start page itself
 * is passed over.
 */
function hreflangTarget(start: Page, code: string, self: Set<string>): string | undefined {
  const alternates = { ...start.noJs.alternates, ...start.js.alternates };
  const other = (k: string) => isWebUrl(alternates[k]) && !self.has(withoutHash(alternates[k]));
  const keys = Object.keys(alternates).filter((k) => primaryTag(k) === code && other(k));
  const key = keys.find((k) => k === code) ?? keys[0];
  return key ? alternates[key] : undefined;
}

function legalTargets(start: Page, lang: Language): string[] {
  const urls: string[] = [];
  // Legal-page links are wording from the law: match them with the link words of every language, not only the scan language.
  const allLang = { ...lang, links: legalLinkPatterns() };
  for (const concept of Object.keys(lang.links)) {
    const hrefs = matchLinks(LEGAL_CONCEPTS.includes(concept) ? allLang : lang, concept, pageLinks(start))
      .map((l) => l.href)
      .filter(isPage);
    urls.push(...[...new Set(hrefs)].slice(0, CRAWL.legal_links_per_concept));
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

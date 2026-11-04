// Everything a check needs. Checks import from this file and nothing else.

import { siteOf } from "./text.ts";
import type { UiLanguage } from "./rules.ts";

export { loadYaml } from "./data.ts";
export { MANIFESTS } from "./repo/lockfiles.ts";

export const STATUSES = ["pass", "warn", "fail", "info", "skip"] as const;
export type Status = (typeof STATUSES)[number];

/** A text in every report language, from data/*.yml (for example a vendor's advice). */
export type Localized = Record<UiLanguage, string>;

/**
 * Parameters of a message. A Msg as value is rendered in the same language (for example a page name),
 * a Localized picks the report language.
 */
export type Params = Record<string, string | number | Msg | Localized>;

/** A sentence by key; the words are in lang/<code>.yml `messages.<check id>` or `messages.common`. */
export interface Msg {
  key: string;
  params?: Params;
}

/** One place a result was found. With `file` (and `line`), GitHub shows it as an annotation in pull requests. */
export interface Finding {
  file?: string;
  line?: number;
  /** Message key for this finding, rendered like a Msg. */
  key?: string;
  params?: Params;
  /** A value shown as it is: a URL, a host, a cookie name. */
  text?: string;
}

export interface Result {
  status: Status;
  /** Never a sentence: the words are in lang/<code>.yml, so the report can use any language. */
  message: Msg;
  details?: Finding[];
}

export const msg = (key: string, params?: Params): Msg => ({ key, params });

/** Checks a website. Lives in checks/<category>/<name>/check.ts, metadata in rule.yml next to it. */
export interface Check {
  repo?: false;
  run(ctx: ScanContext): Result | Promise<Result>;
}

/** Checks the repository the workflow runs in. Lives in checks/repo/<name>/check.ts. */
export interface RepoCheck {
  repo: true;
  run(repo: RepoContext): Result | Promise<Result>;
}

export const defineCheck = (check: Omit<Check, "repo">): Check => ({ ...check, repo: false });
export const defineRepoCheck = (check: Omit<RepoCheck, "repo">): RepoCheck => ({ ...check, repo: true });

type Details = Result["details"];
export const pass = (message: Msg, details?: Details): Result => ({ status: "pass", message, details });
export const warn = (message: Msg, details?: Details): Result => ({ status: "warn", message, details });
export const fail = (message: Msg, details?: Details): Result => ({ status: "fail", message, details });
export const info = (message: Msg, details?: Details): Result => ({ status: "info", message, details });
export const skip = (message: Msg, details?: Details): Result => ({ status: "skip", message, details });

/** GitHub Actions workflow files, for `repo.find(WORKFLOWS)`. */
export const WORKFLOWS = /^\.github\/workflows\/.*\.ya?ml$/;

/** Fewer visible characters than this count as an empty page. */
export const MIN_TEXT = 100;

/** true when the snapshot loaded with HTTP 2xx/3xx. */
export const loaded = (s?: Snapshot): s is Snapshot => !!s && s.status > 0 && s.status < 400;

// ---------- Start page

/** Links and buttons of both loads of a page, JavaScript on first, without duplicates. */
export function pageLinks(page: Page): Link[] {
  const seen = new Set<string>();
  return [...page.js.links, ...page.noJs.links].filter((l) => {
    const key = `${l.href}\n${l.label}\n${l.area}\n${l.button}`;
    return !seen.has(key) && !!seen.add(key);
  });
}

/** Links and buttons on the start page, both loads; with `concept`, only those matching it (lang/*.yml `links`). */
export const startLinks = (ctx: ScanContext, concept?: string): Link[] =>
  concept ? ctx.links(concept, pageLinks(ctx.start)) : pageLinks(ctx.start);

/** Checkboxes on the start page, both loads, without duplicates. */
export function startCheckboxes(ctx: ScanContext): Checkbox[] {
  const seen = new Set<string>();
  return [...ctx.start.js.checkboxes, ...ctx.start.noJs.checkboxes].filter((b) => {
    const key = `${b.label}\n${b.checked}\n${b.disabled}`;
    return !seen.has(key) && !!seen.add(key);
  });
}

/**
 * The start page as the server sent it, for status, headers, `meta` and `lang`:
 * the load without JavaScript, or the one with JavaScript when that one failed.
 */
export const startSnapshot = (ctx: ScanContext): Snapshot => (ctx.start.noJs.status > 0 ? ctx.start.noJs : ctx.start.js);

// ---------- Legal pages

/** Pages every site must link. `concept` is the lang/*.yml `links` key, `check` the rule that looks for the link. */
export const LEGAL_PAGES = [
  { concept: "imprint", name: "imprint", law: "Impressum", check: "legal/imprint" },
  { concept: "privacy", name: "privacy policy", law: "Datenschutzerklärung", check: "legal/privacy-policy" },
] as const;
/** The page's name as a message (`messages.common.page_<concept>`). */
const pageName = (concept: LegalConcept): Msg => msg(`page_${concept}`);
export type LegalConcept = (typeof LEGAL_PAGES)[number]["concept"];
const legal = (concept: LegalConcept) => LEGAL_PAGES.find((p) => p.concept === concept)!;

/** The page a legal link leads to, if it was visited and loaded. */
export function loadedPage(ctx: ScanContext, concept: string): Page | undefined {
  const page = ctx.legalPage(concept)?.page;
  return page && loaded(page.js) ? page : undefined;
}

/**
 * The loaded legal page, or the skip result to return when there is none:
 * `const page = needLegalPage(ctx, "privacy"); if ("status" in page) return page;`
 */
export function needLegalPage(ctx: ScanContext, concept: LegalConcept): Page | Result {
  return loadedPage(ctx, concept) ?? skip(msg("no_page", { page: pageName(concept), check: legal(concept).check }));
}

/** fail unless the start page links to a page for `concept` that loads and has text. */
export function linkedPageResult(ctx: ScanContext, concept: LegalConcept): Result {
  const page = pageName(concept);
  const found = ctx.legalPage(concept);
  if (!found) return fail(msg("no_link", { page }));
  const where = ctx.short(found.link.href ?? "");
  const snap = found.page?.js;
  if (!snap || snap.status === 0) return fail(msg("not_loaded", { page, where }), snap?.error ? [{ text: snap.error }] : undefined);
  if (snap.status >= 400) return fail(msg("http_error", { page, where, status: snap.status }));
  if (snap.text.trim().length < MIN_TEXT) return fail(msg("empty", { page, where }));
  return pass(msg("found", { page, where }));
}

/** A button the law asks for on the start page (cancellation, withdrawal) and its confirmation page. */
export interface ButtonRule {
  /** lang/*.yml `links` concept with the wording from the law. */
  exact: string;
  /** `links` concept for wording that means the same. Matched on the visible text only, not the URL. */
  similar: string;
  /** lang/*.yml `text` concept for the confirmation button on the page behind it. */
  confirm: string;
}

/**
 * Finds the button with the wording from the law (or similar wording, which warns) and checks the
 * confirmation button on the page behind it. A control that could not be followed gives info.
 * The calling check's messages name the page and the wording from the law: missing, not_followed,
 * not_followed_button, no_confirm, similar, unconfirmed, incomplete, found (`{text}` = button text, `{where}` = URL).
 */
export function requiredButton(ctx: ScanContext, rule: ButtonRule): Result {
  const exact = startLinks(ctx, rule.exact);
  const link = exact[0] ?? startLinks(ctx).find((l) => ctx.says(rule.similar, l.text));
  if (!link) return fail(msg("missing"));
  const text = link.text;
  const target = ctx.page(link.href)?.js;
  const problems: Finding[] = !loaded(target)
    ? [link.href ? { key: "not_followed", params: { text, where: ctx.short(link.href) } } : { key: "not_followed_button", params: { text } }]
    : ctx.says(rule.confirm, target.text) ? []
    : [{ key: "no_confirm", params: { where: ctx.short(target.finalUrl) } }];
  if (!exact.length) return warn(msg("similar", { text }), problems);
  if (!loaded(target)) return info(msg("unconfirmed", { text }), problems);
  if (problems.length) return warn(msg("incomplete", { text }), problems);
  return pass(msg("found", { text }));
}

// ---------- Requests and cookies

/** Every request made by the site's own pages, both loads. */
export const siteRequests = (ctx: ScanContext): Array<Request & { page: string }> =>
  ctx.sitePages.flatMap((p) => [...p.noJs.requests, ...p.js.requests].map((r) => ({ ...r, page: ctx.short(p.url) })));

/** A third-party service the site's pages contacted. */
export interface Service {
  /** Vendor name from data/third-parties.yml, else the host's registrable domain. */
  name: string;
  vendor?: Vendor;
  hosts: Set<string>;
  /** Pages that contacted it, short form. */
  pages: Set<string>;
}

/** Third-party services contacted by the site's own pages, keyed by vendor name, else by the host's site. */
export function thirdPartyServices(ctx: ScanContext): Map<string, Service> {
  const services = new Map<string, Service>();
  for (const { host, page } of siteRequests(ctx)) {
    if (!ctx.isThirdParty(host)) continue;
    const vendor = ctx.vendor(host);
    const name = vendor?.name ?? siteOf(host);
    const service = services.get(name) ?? { name, vendor, hosts: new Set(), pages: new Set() };
    service.hosts.add(host);
    service.pages.add(page);
    services.set(name, service);
  }
  return services;
}

/** Identity of a cookie: name and domain. */
export const cookieKey = (c: { name: string; domain: string }) => `${c.name}@${c.domain}`;

/** Cookies set on the site's own pages, both loads, once per name and domain, with the first page that set it. */
export function siteCookies(ctx: ScanContext): Array<Cookie & { page: string }> {
  const cookies = new Map<string, Cookie & { page: string }>();
  for (const p of ctx.sitePages) {
    for (const c of [...p.noJs.cookies, ...p.js.cookies]) {
      if (!cookies.has(cookieKey(c))) cookies.set(cookieKey(c), { ...c, page: ctx.short(p.url) });
    }
  }
  return [...cookies.values()];
}

// ---------- Website data

/** Where a link sits. "banner" = inside a dialog, cookie/consent container or shadow root. */
export type Area = "banner" | "header" | "nav" | "main" | "footer" | "other";

export interface Link {
  /** Absolute URL, or null for buttons. */
  href: string | null;
  /** Text as shown on the page. */
  text: string;
  /** Normalized text + aria-label + title + URL path. Language patterns match against this. */
  label: string;
  area: Area;
  button: boolean;
}

export interface Request {
  url: string;
  host: string;
  /** Playwright resource type: document, stylesheet, script, font, image, xhr, fetch ... */
  type: string;
}

export interface Cookie {
  name: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export interface Form {
  /** Absolute URL the form sends to. */
  action: string;
  /** Field types and names, e.g. "email:newsletter". */
  fields: string[];
  /** true when a field asks for email, name, phone, address or birth date. */
  personal: boolean;
  /** Links and visible text in and right around the form. */
  links: Link[];
  text: string;
}

export interface Checkbox {
  label: string;
  checked: boolean;
  disabled: boolean;
}

/** One load of a page, either with JavaScript off (`noJs`) or on (`js`). No clicks, no consent. */
export interface Snapshot {
  /** HTTP status of the document. 0 means the page could not be loaded. */
  status: number;
  error?: string;
  finalUrl: string;
  /** Response headers of the document, lowercase names. */
  headers: Record<string, string>;
  /** Header equivalents from <meta http-equiv> and <meta name="referrer">, lowercase names (referrer becomes referrer-policy). */
  meta: Record<string, string>;
  /** Value of <html lang>. */
  lang: string;
  /** Visible text, as a user would read it. */
  text: string;
  /** Links and buttons, including those in open shadow roots (consent banners). */
  links: Link[];
  forms: Form[];
  checkboxes: Checkbox[];
  requests: Request[];
  /** Cookies this load added. */
  cookies: Cookie[];
  /** localStorage keys (only filled with JavaScript on). */
  storage: string[];
}

export interface Page {
  url: string;
  noJs: Snapshot;
  js: Snapshot;
}

/** A path from data/probes.yml, fetched once without a browser. */
export interface Probe {
  path: string;
  kind: "file" | "error";
  status: number;
  headers: Record<string, string>;
  /** First 50 kB of the body. */
  body: string;
  /** For kind "file": the body looks like the real file (data/probes.yml `expect`). */
  exposed: boolean;
}

export interface Vendor {
  name: string;
  hosts: string[];
  purpose: string;
  /** required: needs consent before loading. check: needs a legal basis, consent is not always necessary. */
  consent: "required" | "check";
  /** ISO country of the company that processes the data. */
  country?: string;
  /** How a privacy policy would name this vendor (normalized). */
  names: string[];
  /** What to do instead, per report language. */
  advice?: Localized;
}

export interface ScanContext {
  /** Final URL of the start page. */
  url: string;
  /** true when the start page is served over HTTPS. */
  https: boolean;
  /** Registrable domain of the start page ("www.example.de" → "example.de"). */
  domain: string;
  languages: string[];
  /** true when the site sells subscriptions or other ongoing contracts. */
  subscriptions: boolean;
  /** true when consumers buy or sign contracts on the site (shop, paid plans). */
  sales: boolean;
  start: Page;
  /** All visited pages, start page first. Can include legal pages on other sites. */
  pages: Page[];
  /** Visited pages on the start page's own site that loaded. Use these for requests and cookies. */
  sitePages: Page[];
  /** Start page over plain http://. Missing in tests. */
  http?: { status: number; location: string } | { error: string };
  /** The other host variant (www. added or removed). Missing in tests. */
  variant?: { url: string; status: number; finalUrl: string } | { url: string; error: string };
  /** TLS certificate of the start page's host. Missing for http:// and in tests. */
  tls?: { protocol: string; validTo: string; daysLeft: number; authorized: boolean; error?: string };
  /** DNS records of the registrable domain `domain` (SPF, DMARC at _dmarc.domain, MX). Missing in tests. */
  dns?: { domain: string; spf?: string; dmarc?: string; mx: boolean };
  probes: Probe[];
  /** Host → ISO country, looked up by IP when an IPinfo token is set. */
  countries: Record<string, string>;

  /** Visited page for a URL (hash ignored). */
  page(url: string | null): Page | undefined;
  /** Links on a snapshot (or in a list) whose label matches a concept from lang/*.yml `links`. */
  links(concept: string, from: Snapshot | Link[]): Link[];
  /** true when the text contains a concept from lang/*.yml (`text`, or `links` if not found there). */
  says(concept: string, text: string): boolean;
  /** true when the text contains the phrase as whole words, both normalized. */
  mentions(text: string, phrase: string): boolean;
  /** Link on the start page for a concept, and the page it leads to (if it was visited). */
  legalPage(concept: string): { link: Link; page?: Page } | undefined;
  /** true when the host belongs to another site than the start page. */
  isThirdParty(host: string): boolean;
  /** Known vendor for a host, from data/third-parties.yml. */
  vendor(host: string): Vendor | undefined;
  /** Known vendor whose tracking cookie has this name. */
  trackingCookie(name: string): Vendor | undefined;
  /** Short form of a URL for reports: path for the same site, full URL otherwise. */
  short(url: string): string;
}

// ---------- Repository data

export type Ecosystem = "npm" | "composer" | "pub" | "cargo" | "pypi" | "go";

export interface Component {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** Package URL, e.g. pkg:npm/lodash@4.17.21. */
  purl: string;
  /** SPDX expression, when the lockfile has one. */
  license?: string;
  /** Only needed for development (devDependencies, require-dev, dev_dependencies). */
  dev: boolean;
  /** Lockfile it came from. */
  source: string;
}

export interface Vulnerability {
  id: string;
  purl: string;
  summary: string;
  /** CRITICAL, HIGH, MODERATE, LOW, or empty. */
  severity: string;
  fixed?: string;
}

export interface RepoContext {
  /** Absolute path of the repository. */
  root: string;
  /** Tracked files, relative paths with "/". */
  files: string[];
  /** Text content of a file, or undefined for missing, binary or very large files. */
  read(path: string): string | undefined;
  /** Tracked files whose path matches. */
  find(pattern: RegExp): string[];
  /** A YAML or JSON file, parsed. undefined when the file cannot be read or parsed. */
  yaml<T = unknown>(path: string): T | undefined;
  /** Project license as found in package.json, composer.json or LICENSE. */
  license: string;
  components: Component[];
  /** Lockfiles that were read. */
  lockfiles: string[];
  /** Known vulnerabilities from OSV. */
  vulnerabilities: Vulnerability[];
  /** "ok", "ok (details for N of M)" when OSV sent details for only some issues, "skipped" (no network, tests) or an error message. */
  osv: string;
}

// Everything a check needs. Checks import from this file and nothing else.

export { loadYaml } from "./data.ts";

export const STATUSES = ["pass", "warn", "fail", "info", "skip"] as const;
export type Status = (typeof STATUSES)[number];

export interface Result {
  status: Status;
  message: string;
  details?: string[];
}

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

export const pass = (message: string, details?: string[]): Result => ({ status: "pass", message, details });
export const warn = (message: string, details?: string[]): Result => ({ status: "warn", message, details });
export const fail = (message: string, details?: string[]): Result => ({ status: "fail", message, details });
export const info = (message: string, details?: string[]): Result => ({ status: "info", message, details });
export const skip = (message: string, details?: string[]): Result => ({ status: "skip", message, details });

/** Fewer visible characters than this count as an empty page. */
export const MIN_TEXT = 100;

/** true when the snapshot loaded with HTTP 2xx/3xx. */
export const loaded = (s?: Snapshot): s is Snapshot => !!s && s.status > 0 && s.status < 400;

/** The page a legal link leads to, if it was visited and loaded. */
export function loadedPage(ctx: ScanContext, concept: string): Page | undefined {
  const page = ctx.legalPage(concept)?.page;
  return page && loaded(page.js) ? page : undefined;
}

/** fail unless the start page links to a page for `concept` that loads and has text. */
export function linkedPageResult(ctx: ScanContext, concept: string, name: string): Result {
  const found = ctx.legalPage(concept);
  if (!found) return fail(`No link to the ${name} on the start page.`);
  const where = ctx.short(found.link.href ?? "");
  const page = found.page?.js;
  if (!page || page.status === 0) return fail(`The ${name} link ${where} could not be loaded.`, page?.error ? [page.error] : undefined);
  if (page.status >= 400) return fail(`The ${name} at ${where} returns HTTP ${page.status}.`);
  if (page.text.trim().length < MIN_TEXT) return fail(`The ${name} at ${where} is almost empty.`);
  return pass(`${name[0].toUpperCase()}${name.slice(1)} found at ${where}.`);
}

/** Every request made by the site's own pages, both loads. */
export const siteRequests = (ctx: ScanContext): Array<Request & { page: string }> =>
  ctx.sitePages.flatMap((p) => [...p.noJs.requests, ...p.js.requests].map((r) => ({ ...r, page: ctx.short(p.url) })));

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
  advice?: string;
}

export interface ScanContext {
  /** Final URL of the start page. */
  url: string;
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
  /** true when the text contains the phrase, both normalized. */
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
  /** Project license as found in package.json, composer.json or LICENSE. */
  license: string;
  components: Component[];
  /** Lockfiles that were read. */
  lockfiles: string[];
  /** Known vulnerabilities from OSV. */
  vulnerabilities: Vulnerability[];
  /** "ok", "skipped" (no network, tests) or an error message. */
  osv: string;
}

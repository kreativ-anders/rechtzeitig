// Everything a check needs. Checks import from this file and nothing else.

export type Status = "pass" | "warn" | "fail" | "info" | "skip";

export interface Result {
  status: Status;
  message: string;
  details?: string[];
}

export interface Check {
  title: string;
  /** Legal basis shown in the report, e.g. "§ 5 DDG". */
  law?: string;
  run(ctx: ScanContext): Result | Promise<Result>;
}

export const defineCheck = (check: Check): Check => check;

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

export type Area = "header" | "nav" | "main" | "footer" | "other";

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
}

/** One load of a page, either with JavaScript off (`noJs`) or on (`js`). No clicks, no consent. */
export interface Snapshot {
  /** HTTP status of the document. 0 means the page could not be loaded. */
  status: number;
  error?: string;
  finalUrl: string;
  /** Response headers of the document, lowercase names. */
  headers: Record<string, string>;
  /** Value of <html lang>. */
  lang: string;
  /** Visible text, as a user would read it. */
  text: string;
  links: Link[];
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

export interface Vendor {
  name: string;
  hosts: string[];
  purpose: string;
  /** required: needs consent before loading. check: needs a legal basis, consent is not always necessary. */
  consent: "required" | "check";
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
  start: Page;
  /** All visited pages, start page first. Can include legal pages on other sites. */
  pages: Page[];
  /** Visited pages on the start page's own site that loaded. Use these for requests and cookies. */
  sitePages: Page[];
  /** Result of requesting the start page over plain http://. Missing when not checked. */
  http?: { status: number; location: string } | { error: string };

  /** Visited page for a URL (hash ignored). */
  page(url: string | null): Page | undefined;
  /** Links and buttons on a snapshot whose label matches a concept from lang/*.yml `links`. */
  links(concept: string, snapshot: Snapshot): Link[];
  /** true when the text contains a concept from lang/*.yml `text`. */
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

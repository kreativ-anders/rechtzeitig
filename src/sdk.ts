// Everything a check needs. Checks import from this file and nothing else.

import { hostIn, siteOf } from "./text.ts";
import type { UiLanguage } from "./rules.ts";

export { loadYaml } from "./data.ts";
import { loadYaml } from "./data.ts";
export { isWebUrl } from "./text.ts";
export { MANIFESTS } from "./repo/lockfiles.ts";
import { MANIFESTS } from "./repo/lockfiles.ts";
export { DECLARING, declaredDependencies, lockfilesFor, ownName, pypiName, type Declared } from "./repo/manifests.ts";
export { satisfies } from "./repo/semver.ts";

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
  /**
   * What makes this finding the same finding in the next run, for code scanning alerts (src/sarif.ts).
   * Default: key and params. Set it when params carry data that can change for the same finding.
   */
  fingerprint?: string;
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

/** Checks the repository the workflow runs in. Lives in checks/<group>/<name>/check.ts, the group of its legal basis. */
export interface RepoCheck {
  repo: true;
  run(repo: RepoContext): Result | Promise<Result>;
}

/**
 * Checks the website and the repository together: what only a scan of both can show, such as a package in the
 * code that the privacy policy does not name, or a header the repository configures that the site does not send.
 * Runs only when both a URL and a checkout exist; otherwise the runner skips it and says which side is missing.
 */
export interface CrossCheck {
  repo: "both";
  run(ctx: ScanContext, repo: RepoContext): Result | Promise<Result>;
}

/** Any check type. `repo` tells them apart: false or missing = website, true = repository, "both" = both. */
export type AnyCheck = Check | RepoCheck | CrossCheck;

export const defineCheck = (check: Omit<Check, "repo">): Check => ({ ...check, repo: false });
export const defineRepoCheck = (check: Omit<RepoCheck, "repo">): RepoCheck => ({ ...check, repo: true });
export const defineCrossCheck = (check: Omit<CrossCheck, "repo">): CrossCheck => ({ ...check, repo: "both" });

type Details = Result["details"];
export const pass = (message: Msg, details?: Details): Result => ({ status: "pass", message, details });
export const warn = (message: Msg, details?: Details): Result => ({ status: "warn", message, details });
export const fail = (message: Msg, details?: Details): Result => ({ status: "fail", message, details });
export const info = (message: Msg, details?: Details): Result => ({ status: "info", message, details });
export const skip = (message: Msg, details?: Details): Result => ({ status: "skip", message, details });

/** Test fixtures: example files, not the project's own. */
export const FIXTURES = /(^|\/)fixtures?\//;

/** true when a package manifest lies anywhere outside fixtures, so the repository is a software project. */
export const isSoftwareProject = (repo: RepoContext) =>
  repo.files.some((f) => !FIXTURES.test(f) && Object.hasOwn(MANIFESTS, f.split("/").pop() ?? ""));

/** GitHub Actions workflow files, for `repo.find(WORKFLOWS)`. */
export const WORKFLOWS = /^\.github\/workflows\/.*\.ya?ml$/;

/** Fewer visible characters than this count as an empty page. */
export const MIN_TEXT = 100;

/** The items whose `key` was not seen before, in order. */
export function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    return !seen.has(k) && !!seen.add(k);
  });
}

/** Line number (from 1) of a character index in a text. */
export const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Fields of a security.txt (RFC 9116) that the checks read. */
export interface SecurityTxt {
  contact: string[];
  /** Expires as written. */
  expires?: string;
  /** Expires lies before `now`. */
  expired: boolean;
}

const SECURITY_FIELD = /^[ \t]*(Contact|Expires):[ \t]*(\S.*?)[ \t\r]*$/gim;

/** Parses a security.txt. undefined when it has no Contact field, for example an HTML page served for every path. */
export function parseSecurityTxt(text: string, now = Date.now()): SecurityTxt | undefined {
  const fields = [...text.matchAll(SECURITY_FIELD)];
  const contact = fields.filter((m) => m[1].toLowerCase() === "contact").map((m) => m[2]);
  if (!contact.length) return undefined;
  const expires = fields.find((m) => m[1].toLowerCase() === "expires")?.[2];
  const time = expires ? Date.parse(expires) : NaN;
  return { contact, expires, expired: !Number.isNaN(time) && time < now };
}

/** true when the snapshot loaded with HTTP 2xx/3xx. */
export const loaded = (s?: Snapshot): s is Snapshot => !!s && s.status > 0 && s.status < 400;

// ---------- Start page

/** Links and buttons of both loads of a page, JavaScript on first, without duplicates. */
export const pageLinks = (page: Page): Link[] =>
  unique([...page.js.links, ...page.noJs.links], (l) => `${l.href}\n${l.label}\n${l.area}\n${l.button}`);

/** Links and buttons on the start page, both loads; with `concept`, only those matching it (lang/*.yml `links`). */
export const startLinks = (ctx: ScanContext, concept?: string): Link[] =>
  concept ? ctx.links(concept, pageLinks(ctx.start)) : pageLinks(ctx.start);

/** Checkboxes on the start page, both loads, without duplicates. */
export const startCheckboxes = (ctx: ScanContext): Checkbox[] =>
  unique([...ctx.start.js.checkboxes, ...ctx.start.noJs.checkboxes], (b) => `${b.label}\n${b.checked}\n${b.disabled}`);

/**
 * The start page as the server sent it, for status, headers, `meta` and `lang`:
 * the load without JavaScript, or the one with JavaScript when that one failed.
 */
export const startSnapshot = (ctx: ScanContext): Snapshot => (ctx.start.noJs.status > 0 ? ctx.start.noJs : ctx.start.js);

// ---------- Legal pages

/** Pages every site must link. `concept` is the lang/*.yml `links` key, `check` the rule that looks for the link. */
export const LEGAL_PAGES = [
  { concept: "imprint", check: "legal/imprint" },
  { concept: "privacy", check: "legal/privacy-policy" },
] as const;
/** Pages a shop links besides those, read only by checks that need `sales: true`. */
export const SALES_PAGES = [
  { concept: "terms", check: "legal/terms-link" },
  { concept: "withdrawal_info", check: "legal/withdrawal-instruction" },
] as const;
export type LegalConcept = (typeof LEGAL_PAGES)[number]["concept"] | (typeof SALES_PAGES)[number]["concept"];
/** The page's name as a message (`messages.common.page_<concept>`). */
export const pageName = (concept: LegalConcept): Msg => msg(`page_${concept}`);
const legal = (concept: LegalConcept) => [...LEGAL_PAGES, ...SALES_PAGES].find((p) => p.concept === concept)!;

/** The page a legal link leads to, if it was visited and loaded. */
function loadedPage(ctx: ScanContext, concept: string): Page | undefined {
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

// ---------- Served code

/** Documents and scripts of the site itself as the server sent it, once per URL. */
export const siteCode = (ctx: ScanContext): ServedCode[] => ctx.code.filter((c) => !ctx.isThirdParty(new URL(c.url).hostname));

/** Hosts of the site's requests and of the URLs in its served code that lie under one of `domains`, sorted, once each. */
export function hostsIn(ctx: ScanContext, domains: string[]): string[] {
  const hosts = new Set(siteRequests(ctx).map((r) => r.host));
  for (const c of siteCode(ctx)) for (const m of c.body.matchAll(/https?:\/\/([a-z0-9.-]{1,253})/gi)) hosts.add(m[1].toLowerCase());
  return [...hosts].filter((h) => domains.some((d) => hostIn(h, d))).sort();
}

// ---------- Secrets

type EntropyLevel = "token" | "generic";
const SECRET_DATA = loadYaml<{
  placeholders: string[];
  rules: Array<{
    name: string;
    pattern: string;
    /** Lowercase strings, one of which the text must contain before the pattern runs. */
    keywords?: string[];
    /** Minimum entropy of the `secret` group, from data/thresholds.yml. */
    entropy?: EntropyLevel;
    /** A `secret` that matches this is a documented example. */
    allow?: string;
    /** Claims the JWT payload in match group 1 must have. */
    payload?: Record<string, string>;
    severity: "fail" | "warn";
  }>;
}>("data/secrets.yml");
const MIN_ENTROPY = loadYaml<Record<string, { entropy: Record<EntropyLevel, number> }>>("data/thresholds.yml")["security/secrets"].entropy;
const SECRET_RULES = SECRET_DATA.rules.map((r) => ({ ...r, re: new RegExp(r.pattern, "g"), allowRe: r.allow ? new RegExp(r.allow) : undefined }));

function claims(part: string | undefined, expected: Record<string, string>): boolean {
  try {
    const payload = JSON.parse(Buffer.from(part ?? "", "base64url").toString("utf8"));
    return Object.entries(expected).every(([k, v]) => payload?.[k] === v);
  } catch {
    return false; // not a JWT after all
  }
}

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / s.length) * Math.log2(n / s.length);
  return bits;
}

/** True when a match looks like a real secret, not a placeholder or a documented example. */
function realSecret(rule: (typeof SECRET_RULES)[number], m: RegExpMatchArray): boolean {
  const secret = m.groups?.secret ?? m[0];
  if (rule.payload && !claims(m[1], rule.payload)) return false;
  if (rule.allowRe?.test(secret)) return false;
  if (!rule.entropy) return true;
  const lower = secret.toLowerCase();
  return entropy(secret) >= MIN_ENTROPY[rule.entropy] && !SECRET_DATA.placeholders.some((p) => lower.includes(p));
}

/** A secret found in a text by a pattern in data/secrets.yml. */
export interface SecretMatch {
  name: string;
  severity: "fail" | "warn";
  /** Found by the generic assignment rule (a random-looking value under a secret-like name), not a named pattern. */
  generic: boolean;
  value: string;
  index: number;
}

/**
 * Secrets in a text (data/secrets.yml): one per pattern, the first match that passes the filters (keywords,
 * JWT claims, documented examples, placeholders, entropy). The generic rule only speaks when no named one found something.
 */
export function findSecrets(text: string): SecretMatch[] {
  const lower = text.toLowerCase();
  const found: SecretMatch[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.keywords && !rule.keywords.some((k) => lower.includes(k))) continue;
    if (rule.entropy === "generic" && found.length) continue;
    const m = [...text.matchAll(rule.re)].find((m) => realSecret(rule, m));
    if (m) found.push({ name: rule.name, severity: rule.severity, generic: rule.entropy === "generic", value: m.groups?.secret ?? m[0], index: m.index });
  }
  return found;
}

/** Enough to find a secret again, too little to use it: the first 4 characters and the length. */
export const redact = (s: string) => ({ start: s.slice(0, 4), length: s.length });

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
  /** Rendered size and colors, only for buttons and links in the banner area (consent banners). */
  style?: Style;
}

/** Rendered box of an element: CSS pixels, computed colors as rgb()/rgba(), background taken from the first non-transparent ancestor. */
export interface Style {
  width: number;
  height: number;
  fontSize: number;
  color: string;
  background: string;
}

export interface Request {
  url: string;
  host: string;
  /** Playwright resource type: document, stylesheet, script, font, image, xhr, fetch ... */
  type: string;
  /** HTTP status and headers of the answer, with the browser cache off. Missing when no answer came. */
  status?: number;
  contentType?: string;
  cacheControl?: string;
  expires?: string;
  /** Content-Encoding header of the answer (gzip, br, zstd ...). */
  contentEncoding?: string;
  /** Content-Length header of the answer in bytes, when the server sent one. */
  contentLength?: number;
}

export interface Cookie {
  name: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  /** Expiry in seconds since the epoch; -1 for a session cookie. */
  expires: number;
}

/** A <script src> or <link rel=stylesheet> in the DOM. */
export interface Subresource {
  url: string;
  type: "script" | "stylesheet";
  /** true when the element has a non-empty integrity attribute. */
  integrity: boolean;
}

/** An <img> in the DOM. belowFold: its top edge is below the first viewport (1280x720). */
export interface Image {
  url: string;
  /** Value of the loading attribute, lowercase, "" when missing. */
  loading: string;
  belowFold: boolean;
  width: number;
  height: number;
}

/** A <video> in the DOM, with its attributes as the page sets them. */
export interface Video {
  url: string;
  autoplay: boolean;
  muted: boolean;
  controls: boolean;
  loop: boolean;
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
  /** Short texts with a digit that are struck through (<del>, <s>, CSS line-through), such as old prices. At most 100. */
  struck: string[];
  requests: Request[];
  /** Cookies this load added. */
  cookies: Cookie[];
  /** localStorage keys (only filled with JavaScript on). */
  storage: string[];
  /** Scripts and stylesheets referenced in the DOM, with their integrity attribute. */
  subresources: Subresource[];
  images: Image[];
  videos: Video[];
  /** axe-core violations of the rules in data/accessibility.yml (JavaScript on only). Missing when axe did not run or did not finish. */
  axe?: AxeViolation[];
}

/** One axe-core rule that failed on a page: how many elements, and the CSS selectors of the first few (data/thresholds.yml `axe.max_targets`). */
export interface AxeViolation {
  rule: string;
  count: number;
  targets: string[];
}

/** A document or script as the server sent it, from the load with JavaScript (limits: data/thresholds.yml `code`). */
export interface ServedCode {
  url: string;
  type: "document" | "script";
  body: string;
  /** The body was longer than the limit and is cut. */
  truncated: boolean;
}

/** A source map that a script of the site points to (`sourceMappingURL`), requested once without a browser. */
export interface SourceMap {
  /** URL of the map, or "inline" for a data: URL in the script. */
  url: string;
  /** Script that points to it. */
  script: string;
  /** HTTP status; 200 for inline maps, 0 when it could not be loaded. */
  status: number;
  /** The `sources` field: paths of the original files. */
  sources: string[];
  /** true when the map also carries the source code (`sourcesContent`). */
  content: boolean;
}

export interface Page {
  url: string;
  noJs: Snapshot;
  js: Snapshot;
}

/** A path from data/probes.yml, fetched once without a browser. */
export interface Probe {
  path: string;
  /** file: must not be public; error: provokes an error page; public: should be public, read by a check. */
  kind: "file" | "error" | "public";
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
  /** npm packages of the vendor's SDK; a trailing * matches a prefix ("@sentry/*"). */
  packages?: string[];
  /** Regular expressions for the vendor's account or tag ids in code (group 1 is the id, else the whole match). */
  ids?: string[];
  /** Regular expressions for code that sends a form to the vendor (endpoint URLs, SDK imports, form attributes). */
  forms?: string[];
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
  /** Green Web Foundation answer for the start page's host. Missing with green-hosting: false, for IPs and local hosts, and in tests. */
  green?: { host: string; green: boolean; hostedBy?: string } | { host: string; error: string };
  probes: Probe[];
  /** Host → ISO country, looked up by IP when an IPinfo token is set. */
  countries: Record<string, string>;
  /** Documents and scripts the pages loaded with JavaScript, once per URL, all sites. Use `siteCode()` for the site's own. */
  code: ServedCode[];
  /** Documents and scripts not kept because of the limits in data/thresholds.yml `code`. */
  codeSkipped: number;
  /** Source maps the site's own scripts point to, up to `code.max_maps`. */
  sourceMaps: SourceMap[];

  /** Visited page for a URL (hash ignored). */
  page(url: string | null): Page | undefined;
  /** Links on a snapshot (or in a list) whose label matches a concept from lang/*.yml `links`. */
  links(concept: string, from: Snapshot | Link[]): Link[];
  /** true when the text contains a concept from lang/*.yml (`text`, or `links` if not found there). */
  says(concept: string, text: string): boolean;
  /** What a concept from lang/*.yml matches in the text, normalized, once each (`text`, or `links` if not found there). */
  matches(concept: string, text: string): string[];
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
  /** Known vendor whose SDK has this npm package name (`packages` in data/third-parties.yml). */
  packageVendor(name: string): Vendor | undefined;
  /** Every vendor in data/third-parties.yml, in file order. */
  vendors: Vendor[];
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

/** Why a lockfile gave no components: too large, a Git LFS pointer, binary, or not in the expected format. */
export type UnreadReason = "large" | "lfs" | "binary" | "invalid";

/**
 * What the repository scan could not see or read. The report lists it under the scan line and in
 * rechtzeitig-report.json, so a gap never looks like a clean result.
 */
export interface RepoCoverage {
  /** "git": git ls-files with submodules. "walk": a plain folder walk that ignores .gitignore. */
  listing: "git" | "walk";
  /** Why the folder was walked, when it was. */
  walked?: string;
  /** Submodules from every .gitmodules and gitlink. Not checked out means their files were not scanned. */
  submodules: Array<{ path: string; checkedOut: boolean }>;
  /** Git LFS pointer files: the file itself was not checked out (actions/checkout `lfs: true`). */
  lfs: string[];
  /** Files not read because they are larger than the limit in data/thresholds.yml `repo`. */
  large: string[];
  /** Files not read because they are binary. */
  binary: string[];
  lockfiles: {
    /** Read, with at least one component. */
    parsed: string[];
    /** Read, but without a single component. */
    empty: string[];
    /** Known lockfile names that could not be read. */
    failed: Array<{ file: string; reason: UnreadReason }>;
  };
  /** Package files without a parser yet (data/ecosystems.yml `unsupported`). */
  unsupported: Array<{ file: string; ecosystem: string }>;
  /** Package sources outside the public registries: only named, never contacted. */
  private: Array<{ file: string; kind: "registry" | "git" | "replace"; source: string }>;
}

export interface RepoContext {
  /** Absolute path of the repository. */
  root: string;
  /** Tracked files, relative paths with "/", including those of checked-out submodules. */
  files: string[];
  /** Text content of a file, or undefined for missing, binary or too large files (data/thresholds.yml `repo`). */
  read(path: string): string | undefined;
  /** Tracked files whose path matches. */
  find(pattern: RegExp): string[];
  /** A YAML or JSON file, parsed. undefined when the file cannot be read or parsed. */
  yaml<T = unknown>(path: string): T | undefined;
  /** Project license as found in package.json, composer.json or LICENSE. */
  license: string;
  components: Component[];
  /** Lockfiles that were read, with or without components. */
  lockfiles: string[];
  /** What the scan could not see or read. */
  coverage: RepoCoverage;
  /** Known vulnerabilities from OSV. */
  vulnerabilities: Vulnerability[];
  /** "ok", "ok (details for N of M)" when OSV sent details for only some issues, "skipped" (no network, tests) or an error message. */
  osv: string;
}

const MAX_LISTED = loadYaml<{ common: { max_listed: number } }>("data/thresholds.yml").common.max_listed;

/** The first `common.max_listed` details (data/thresholds.yml), then one `more` finding with the count of the rest. The check's messages need `more`. */
export function capped(details: Finding[]): Finding[] {
  if (details.length <= MAX_LISTED) return details;
  return [...details.slice(0, MAX_LISTED), { key: "more", params: { count: details.length - MAX_LISTED } }];
}

// ---------- Accessibility

/**
 * Result of a check built on axe-core: the violations of `rules` (its list in data/accessibility.yml)
 * on all visited own pages with JavaScript on. Skip when axe ran on none of them, warn with one
 * `node` finding per element (rule, page, selector), otherwise pass. The check's messages need
 * `none` and `found` (with `count`), `node` (`rule`, `page`, `target`) and `more`.
 */
export function axeResult(ctx: ScanContext, rules: string[]): Result {
  const pages = ctx.sitePages.filter((p) => p.js.axe);
  if (!pages.length) return skip(msg("axe_not_run"));
  const hits = pages.flatMap((p) => (p.js.axe ?? []).filter((v) => rules.includes(v.rule)).map((v) => ({ ...v, page: ctx.short(p.url) })));
  if (!hits.length) return pass(msg("none", { count: pages.length }));
  const count = hits.reduce((n, v) => n + v.count, 0);
  const details = hits.flatMap((v) => v.targets.map((target): Finding => ({ key: "node", params: { rule: v.rule, page: v.page, target } })));
  return warn(msg("found", { count }), capped(details));
}

// ---------- Repository helpers

/** true when an npm package name matches a pattern; a trailing * matches a prefix ("@sentry/*", "@fontsource*"). */
export const packageMatches = (name: string, pattern: string) =>
  pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;

/** A runtime dependency (`dependencies`, `optionalDependencies`) named in a package.json outside fixtures and node_modules. */
export interface DirectPackage {
  name: string;
  file: string;
  line: number;
}

/**
 * The npm packages the project itself names, not the ones they pull in, and the package.json files it could not read.
 * devDependencies are left out: they build the site, they do not run in it.
 */
export function directPackages(repo: RepoContext): { packages: DirectPackage[]; unread: string[] } {
  const packages: DirectPackage[] = [];
  const unread: string[] = [];
  for (const file of repo.find(/(^|\/)package\.json$/)) {
    if (FIXTURES.test(file) || /(^|\/)node_modules\//.test(file)) continue;
    const text = repo.read(file);
    const json = text === undefined ? undefined : repo.yaml<Record<string, unknown>>(file);
    if (text === undefined || !json || typeof json !== "object") {
      unread.push(file);
      continue;
    }
    for (const field of ["dependencies", "optionalDependencies"]) {
      const deps = json[field];
      if (!deps || typeof deps !== "object") continue;
      for (const name of Object.keys(deps)) {
        const at = text.indexOf(JSON.stringify(name));
        packages.push({ name, file, line: at < 0 ? 1 : lineAt(text, at) });
      }
    }
  }
  return { packages, unread };
}

/** Files the project wrote itself and ships: tracked, without fixtures, tests, node_modules, lockfiles, minified and map files. */
const NOT_OWN = /(^|\/)(fixtures?|__snapshots__|__tests__|node_modules|vendor)\/|(^|[\/.])(test|spec)\.[cm]?[jt]sx?$|\.lock$|-lock\.(json|yaml)$|\.min\.(js|css)$|\.map$/;
export const ownFiles = (repo: RepoContext): string[] => repo.files.filter((f) => !NOT_OWN.test(f));

/** A line of the project's own files that a pattern matched. */
export interface CodeMatch {
  file: string;
  line: number;
  match: RegExpExecArray;
  /** Index of the pattern that matched. */
  pattern: number;
}

/**
 * Lines of the project's own files (`ownFiles`) whose path matches `files` and that one of the patterns matches,
 * at most one match per pattern and line, and the files of that kind that could not be read (too large, Git LFS pointer),
 * so a check can tell a clean result from one it could not see.
 */
export function grepFiles(repo: RepoContext, files: { test(path: string): boolean }, patterns: RegExp[]): { matches: CodeMatch[]; unread: string[] } {
  const matches: CodeMatch[] = [];
  const unread: string[] = [];
  const res = patterns.map((re) => new RegExp(re.source, re.flags.replace("g", "")));
  for (const file of ownFiles(repo).filter((f) => files.test(f))) {
    const text = repo.read(file);
    if (text === undefined) {
      if (repo.coverage.large.includes(file) || repo.coverage.lfs.includes(file)) unread.push(file);
      continue;
    }
    text.split("\n").forEach((line, i) => {
      res.forEach((re, pattern) => {
        const m = re.exec(line);
        if (m) matches.push({ file, line: i + 1, match: m, pattern });
      });
    });
  }
  return { matches, unread };
}

/** A path regex for files with one of these extensions. */
export const extensions = (list: string[]) => new RegExp(`\\.(${list.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`, "i");

// ---------- Consent tools (data/consent-tools.yml)

const CONSENT = loadYaml<{ packages: string[]; scripts: string[]; files: string[]; env: string }>("data/consent-tools.yml");
const ENV_FILE = new RegExp(CONSENT.env);
const CODE_EXT = extensions(CONSENT.files);
/** Templates, code and config of the project that can load a script or hold a tag id, and tracked .env files. */
export const CODE_FILES = { test: (f: string) => CODE_EXT.test(f) || ENV_FILE.test(f) };

/** Consent tools the repository installs (package) or loads (script line of a hosted platform). */
export interface ConsentInRepo {
  packages: DirectPackage[];
  scripts: CodeMatch[];
  /** Code files that could not be read. */
  unread: string[];
}

export function consentInRepo(repo: RepoContext): ConsentInRepo {
  const packages = directPackages(repo).packages.filter((p) => CONSENT.packages.some((c) => packageMatches(p.name, c)));
  const { matches, unread } = grepFiles(repo, CODE_FILES, CONSENT.scripts.map((s) => new RegExp(s, "i")));
  return { packages, scripts: matches, unread };
}

/** What the live start page shows of consent: a banner with an accept button, and the consent platforms it contacted. */
export function consentOnSite(ctx: ScanContext): { banner: boolean; platforms: string[] } {
  const banner = ctx.links("consent_accept", startLinks(ctx).filter((l) => l.area === "banner")).length > 0;
  const platforms = [...thirdPartyServices(ctx).values()].filter((s) => s.vendor?.purpose === "consent management").map((s) => s.name);
  return { banner, platforms };
}

// ---------- Database rules (Supabase, Firebase)

// Each runs on one SQL statement, anchored at its start, so no pattern spans two statements.
const NAME = String.raw`(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?`; // optional schema, table
const CREATE = new RegExp(String.raw`^\s*create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`, "i");
const ENABLE = new RegExp(String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+enable\s+row\s+level\s+security\b`, "i");
const POLICY = /^\s*create\s+policy\b/i;
const ALLOW_ALL = /\b(using|with\s+check)\s*\(\s*true\s*\)/i;
const OPEN_RULE = /\ballow\b[\w, \t]{1,200}:\s*if\s+true\s*;/;
// Firebase "test mode": open to everyone until a date.
const TEST_MODE = /\ballow\b[\w, \t]{1,200}:\s*if\s+request\.time\s*<\s*timestamp\.date\s*\(/;
const OPEN_RTDB = /"\.(read|write)"\s*:\s*true/;

/**
 * SQL statements without line comments, each with the line it starts on (after leading blank space).
 * Function bodies with ";" split too; their parts match nothing.
 */
function statements(sql: string): Array<{ text: string; line: number }> {
  let line = 1; // removing comments keeps the line breaks
  return sql.replace(/--[^\n]*/g, "").split(";").map((text) => {
    const start = line + (text.match(/^\s*/)![0].match(/\n/g)?.length ?? 0);
    line += text.match(/\n/g)?.length ?? 0;
    return { text, line: start };
  });
}

/** "schema.table" in lower case; tables without a schema are in public. */
const tableName = (m: RegExpExecArray) => `${(m[1] ?? "public").toLowerCase()}.${m[2].toLowerCase()}`;

/** What the repository says about database access: Supabase migrations and Firebase rules. */
export interface DatabaseRules {
  /** supabase/**\/*.sql files. */
  sql: string[];
  /** firestore.rules, storage.rules, database.rules.json. */
  rules: string[];
  /** Files of both kinds that could not be read. */
  unread: string[];
  /** Tables created in the public schema. */
  tables: number;
  /** Tables without row level security (`no_rls`, param `table`), open rules (`open_rules`) and test mode (`test_mode`). */
  problems: Finding[];
  /** Policies that allow everything (`using (true)`, `with check (true)`). */
  openPolicies: number;
}

/** Reads Supabase migrations and Firebase rules: public tables without row level security, rules open to everyone. */
export function databaseRules(repo: RepoContext): DatabaseRules {
  const sql = repo.files.filter((f) => /(^|\/)supabase\/.*\.sql$/.test(f));
  const rules = repo.files.filter((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$/.test(f));
  const unread = [...sql, ...rules].filter((f) => repo.read(f) === undefined);
  // Table → where it is created first.
  const created = new Map<string, { file: string; line: number }>();
  const secured = new Set<string>();
  let openPolicies = 0;
  for (const { file, text: statement, line } of sql.flatMap((file) => statements(repo.read(file) ?? "").map((s) => ({ file, ...s })))) {
    const create = CREATE.exec(statement);
    const enable = ENABLE.exec(statement);
    // Only the public schema is exposed through the Supabase API by default.
    if (create && tableName(create).startsWith("public.") && !created.has(tableName(create))) created.set(tableName(create), { file, line });
    if (enable) secured.add(tableName(enable));
    if (POLICY.test(statement) && ALLOW_ALL.test(statement)) openPolicies++;
  }
  const problems: Finding[] = [...created]
    .filter(([t]) => !secured.has(t))
    .map(([t, where]) => ({ ...where, key: "no_rls", params: { table: t.slice("public.".length) } }));
  for (const file of rules) {
    const text = repo.read(file) ?? "";
    const openMatch = OPEN_RULE.exec(text) ?? OPEN_RTDB.exec(text);
    const testMatch = openMatch ? null : TEST_MODE.exec(text);
    if (openMatch) problems.push({ file, line: lineAt(text, openMatch.index), key: "open_rules" });
    else if (testMatch) problems.push({ file, line: lineAt(text, testMatch.index), key: "test_mode" });
  }
  return { sql, rules, unread, tables: created.size, problems, openPolicies };
}

/**
 * Normalizes text before matching, so language patterns stay simple:
 * lowercase, ä→ae ö→oe ü→ue ß→ss, accents removed, invisible characters removed, single spaces.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]+/g;

/**
 * Untrusted text (file names, link texts, header values) as one short line, for every output:
 * control characters, line breaks and bidi overrides become a space, the length is capped.
 */
export function oneLine(text: string, max = 300): string {
  const s = String(text).replace(CONTROL, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** URL without the #hash, used as the key for visited pages. */
export function withoutHash(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

// Suffixes under which every subdomain is a different owner.
const SHARED_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "com.au", "co.at", "or.at", "co.nz", "co.jp", "com.br",
  "github.io", "gitlab.io", "netlify.app", "vercel.app", "pages.dev", "web.app", "herokuapp.com",
]);

/** Registrable domain of a host ("www.example.de" → "example.de"). Good enough for first/third-party decisions. */
export function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return h;
  const parts = h.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return SHARED_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** true for http:// and https:// URLs. */
/** true when `host` is `domain` or one of its subdomains. */
export const hostIn = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export const isWebUrl = (url: string | null | undefined): url is string => !!url && /^https?:/i.test(url);

/** First line of an error, preferring the network cause (ECONNREFUSED, CERT_HAS_EXPIRED) over fetch's "fetch failed". */
export function errorMessage(e: unknown): string {
  const err = e as { message?: unknown; cause?: { code?: unknown; message?: unknown } } | undefined;
  const text = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? e;
  return String(text).split("\n")[0];
}

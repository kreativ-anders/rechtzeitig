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

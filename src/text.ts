import { readFileSync } from "node:fs";
import { domainToASCII } from "node:url";

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
  if (s.length <= max) return s;
  // Never cut between the two halves of an emoji or another character outside the BMP.
  const cut = /[\ud800-\udbff]/.test(s[max - 2] ?? "") ? max - 2 : max - 1;
  return `${s.slice(0, cut)}…`;
}

/** URL without the #hash, used as the key for visited pages. */
export function withoutHash(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

// Public Suffix List (data/public-suffixes.dat, MPL-2.0), ICANN and private section, refreshed by
// `npm run refresh-suffixes`. Read on first use, so modules that never compare hosts do not pay for it.
const SUFFIX_FILE = new URL("../data/public-suffixes.dat", import.meta.url);
let suffixes: { rules: Set<string>; wildcards: Set<string>; exceptions: Set<string> } | undefined;

/** Unicode labels as URL.hostname gives them (punycode); ASCII stays as it is. */
const toAscii = (host: string) => (/[^\x00-\x7f]/.test(host) ? domainToASCII(host) || host : host);

function suffixRules() {
  if (suffixes) return suffixes;
  const rules = new Set<string>();
  const wildcards = new Set<string>();
  const exceptions = new Set<string>();
  for (const raw of readFileSync(SUFFIX_FILE, "utf8").split("\n")) {
    const line = raw.trim().split(/\s/)[0];
    if (!line || line.startsWith("//")) continue;
    if (line.startsWith("!")) exceptions.add(toAscii(line.slice(1)));
    else if (line.startsWith("*.")) wildcards.add(toAscii(line.slice(2)));
    else rules.add(toAscii(line));
  }
  return (suffixes = { rules, wildcards, exceptions });
}

/** Number of labels of the longest public suffix of `labels` (PSL algorithm; unknown TLDs count as one label). */
function suffixLength(labels: string[]): number {
  const { rules, wildcards, exceptions } = suffixRules();
  for (let i = 0; i < labels.length; i++) {
    const name = labels.slice(i).join(".");
    // An exception rule wins: its suffix is the rule minus its first label.
    if (exceptions.has(name)) return labels.length - i - 1;
    // A wildcard rule "*.ck" matches one more label than "ck".
    if (i > 0 && wildcards.has(name)) return labels.length - i + 1;
    if (rules.has(name)) return labels.length - i;
  }
  return 1;
}

/**
 * Registrable domain of a host ("www.example.de" → "example.de", "shop.azurewebsites.net" stays): the longest
 * public suffix plus one label. IP addresses, single labels and public suffixes themselves stay as they are.
 */
export function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return h;
  const labels = toAscii(h).split(".");
  const keep = suffixLength(labels) + 1;
  return keep > labels.length ? labels.join(".") : labels.slice(-keep).join(".");
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

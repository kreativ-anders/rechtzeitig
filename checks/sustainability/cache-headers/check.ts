import { defineCheck, loadYaml, msg, pass, siteRequests, skip, unique, warn, type Finding, type Request } from "../../../src/sdk.ts";

const STATIC = new Set(loadYaml<{ static: string[] }>("data/file-formats.yml").static);
const MAX = 20;

/** The answer lets a browser reuse the file without asking again: a positive max-age, immutable, or a future Expires. */
function cached(r: Request, now: number): boolean {
  const cc = (r.cacheControl ?? "").toLowerCase();
  if (/\b(no-store|no-cache)\b/.test(cc)) return false;
  const maxAge = /\b(?:s-)?max-age\s*=\s*"?(\d+)/.exec(cc);
  if (maxAge) return Number(maxAge[1]) > 0;
  if (/\bimmutable\b/.test(cc)) return true;
  const expires = r.expires ? Date.parse(r.expires) : NaN;
  return !Number.isNaN(expires) && expires > now;
}

export default defineCheck({
  run(ctx) {
    const files = unique(siteRequests(ctx), (r) => r.url).filter(
      (r) => STATIC.has(r.type) && !ctx.isThirdParty(r.host) && r.status === 200,
    );
    if (!files.length) return skip(msg("no_files"));
    const now = Date.now();
    const uncached = files.filter((r) => !cached(r, now));
    if (!uncached.length) return pass(msg("cached", { count: files.length }));
    const details: Finding[] = uncached.slice(0, MAX).map((r) => ({ text: ctx.short(r.url) }));
    if (uncached.length > MAX) details.push({ key: "more", params: { count: uncached.length - MAX } });
    return warn(msg("uncached", { count: uncached.length, total: files.length }), details);
  },
});

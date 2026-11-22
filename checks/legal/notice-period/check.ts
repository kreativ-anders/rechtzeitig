import { defineCheck, info, loadYaml, loaded, msg, pass, skip, warn, type Finding, type ScanContext } from "../../../src/sdk.ts";

const LIMITS = loadYaml<Record<string, { max_notice_months: number; max_renewal_months: number }>>("data/thresholds.yml")["legal/notice-period"];

/** "3 monaten" in a matched phrase as months; undefined when the unit is no week, month or year. */
function months(ctx: ScanContext, phrase: string): number | undefined {
  const m = /(\d+) (\S+)/.exec(phrase.split(/(?=\b\d+ )/).at(-1) ?? "");
  if (!m) return undefined;
  const n = Number(m[1]);
  if (ctx.says("period_week", m[2])) return (n * 12) / 52;
  if (ctx.says("period_month", m[2])) return n;
  if (ctx.says("period_year", m[2])) return n * 12;
  return undefined;
}

export default defineCheck({
  run(ctx) {
    const terms = ctx.legalPage("terms");
    if (!terms) return skip(msg("no_page", { page: msg("page_terms"), check: "legal/terms-link" }));
    const page = terms.page;
    const snap = page && (loaded(page.js) ? page.js : loaded(page.noJs) ? page.noJs : undefined);
    const where = ctx.short(terms.link.href ?? "");
    // Linked but not read: the periods there are unknown.
    if (!snap) return info(msg("not_read", { where }));
    const found: Finding[] = [];
    for (const [concept, limit, key] of [["notice_period", LIMITS.max_notice_months, "long_notice"], ["renewal_term", LIMITS.max_renewal_months, "long_renewal"]] as const) {
      for (const phrase of ctx.matches(concept, snap.text)) {
        const m = months(ctx, phrase);
        if (m !== undefined && m > limit) found.push({ key, params: { where, phrase } });
      }
    }
    if (found.length) return warn(msg("found", { count: found.length }), found);
    return pass(msg("none", { where }));
  },
});

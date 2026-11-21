import { capped, defineCheck, info, loadYaml, loaded, msg, pass, skip, type Finding, type Page } from "../../../src/sdk.ts";

const DATE = new RegExp(loadYaml<{ date: string[] }>("data/shop.yml").date.join("|"));
const CONTEXT = loadYaml<Record<string, { context_lines: number }>>("data/thresholds.yml")["legal/offer-duration"].context_lines;
const LEGAL = ["imprint", "privacy", "terms", "withdrawal_info"];

export default defineCheck({
  run(ctx) {
    const legal = new Set(LEGAL.map((c) => ctx.legalPage(c)?.page).filter((p): p is Page => !!p));
    const pages = ctx.observedPages.filter((p) => !legal.has(p));
    if (!pages.length) return skip(msg("no_pages"));
    const found: Finding[] = [];
    let offers = 0;
    for (const page of pages) {
      const lines = (loaded(page.js) ? page.js.text : page.noJs.text).split("\n").map((l) => l.trim()).filter(Boolean);
      const open = lines.flatMap((line, i) => {
        const claim = ctx.matches("limited_time", line)[0];
        if (!claim) return [];
        offers++;
        const around = lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).join(" ");
        return DATE.test(around) || ctx.says("date_words", around) ? [] : [claim];
      });
      if (open.length) found.push({ key: "no_end", params: { where: ctx.short(page.url), claim: open[0] } });
    }
    if (found.length) return info(msg("found", { count: found.length }), capped(found));
    if (offers) return pass(msg("dated", { count: offers }));
    return pass(msg("none", { count: pages.length }));
  },
});

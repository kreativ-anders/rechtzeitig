import { defineCheck, info, LEGAL_PAGES, msg, pageName, pass, warn, type Finding, type Msg } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const pages = ctx.sitePages;
    if (pages.length < 2) return info(msg("start_only"));
    const gaps: Finding[] = [];
    for (const page of pages) {
      const missing = LEGAL_PAGES.filter(({ concept }) => !ctx.links(concept, page.js).some((l) => l.href)).map(({ concept }) => pageName(concept));
      if (missing.length) {
        const names = missing.reduce((a: Msg, b) => msg("or", { a, b }));
        gaps.push({ key: "gap", params: { where: ctx.short(page.url), pages: names } });
      }
    }
    if (gaps.length) return warn(msg("gaps", { gaps: gaps.length, count: pages.length }), gaps);
    return pass(msg("all", { count: pages.length }));
  },
});

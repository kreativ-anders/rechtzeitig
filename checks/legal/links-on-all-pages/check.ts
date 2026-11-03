import { defineCheck, info, LEGAL_PAGES, pass, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const pages = ctx.sitePages;
    if (pages.length < 2) return info("Only the start page could be checked.");
    const gaps: string[] = [];
    for (const page of pages) {
      const missing = LEGAL_PAGES.filter(({ concept }) => !ctx.links(concept, page.js).some((l) => l.href)).map(({ name }) => name);
      if (missing.length) gaps.push(`${ctx.short(page.url)}: no link to the ${missing.join(" or ")}`);
    }
    if (gaps.length) return warn(`${gaps.length} of ${pages.length} pages lack a legal link. Both must be reachable from every page.`, gaps);
    return pass(`Both links found on all ${pages.length} pages checked.`);
  },
});

import { defineCheck, fail, LEGAL_PAGES, loaded, MIN_TEXT, msg, pass, skip, startLinks, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const problems: Finding[] = [];
    let found = 0;
    for (const { concept } of LEGAL_PAGES) {
      const page = msg(`label_${concept}`);
      if (!startLinks(ctx, concept).some((l) => l.href)) continue;
      found++;
      if (!ctx.links(concept, ctx.start.noJs).some((l) => l.href)) {
        problems.push({ key: "link_needs_js", params: { page } });
        continue;
      }
      const target = ctx.legalPage(concept)?.page;
      if (target && loaded(target.noJs) && target.noJs.text.trim().length < MIN_TEXT) {
        problems.push({ key: "no_text", params: { page, url: ctx.short(target.url) } });
      }
    }
    if (!found) return skip(msg("no_links"));
    if (problems.length) return fail(msg("needs_js"), problems);
    return pass(msg("readable"));
  },
});

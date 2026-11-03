import { defineCheck, fail, LEGAL_PAGES, loaded, MIN_TEXT, pass, skip, startLinks } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const problems: string[] = [];
    let found = 0;
    for (const { concept, name } of LEGAL_PAGES) {
      const label = `${name[0].toUpperCase()}${name.slice(1)}`;
      if (!startLinks(ctx, concept).some((l) => l.href)) continue;
      found++;
      if (!ctx.links(concept, ctx.start.noJs).some((l) => l.href)) {
        problems.push(`${label}: the link only appears with JavaScript.`);
        continue;
      }
      const page = ctx.legalPage(concept)?.page;
      if (page && loaded(page.noJs) && page.noJs.text.trim().length < MIN_TEXT) {
        problems.push(`${label}: ${ctx.short(page.url)} shows no text without JavaScript.`);
      }
    }
    if (!found) return skip("No imprint or privacy policy link found (see legal/*).");
    if (problems.length) {
      return fail("Mandatory information needs JavaScript. Visitors without it, and many crawlers, cannot find it.", problems);
    }
    return pass("Both are linked and readable without JavaScript.");
  },
});

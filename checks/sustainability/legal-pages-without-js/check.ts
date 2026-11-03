import { defineCheck, fail, loaded, MIN_TEXT, pass, skip } from "../../../src/sdk.ts";

const PAGES: Array<[string, string]> = [
  ["imprint", "Imprint"],
  ["privacy", "Privacy policy"],
];

export default defineCheck({
  run(ctx) {
    const problems: string[] = [];
    let found = 0;
    for (const [concept, name] of PAGES) {
      const withJs = ctx.links(concept, ctx.start.js).filter((l) => l.href);
      const withoutJs = ctx.links(concept, ctx.start.noJs).filter((l) => l.href);
      if (!withJs.length && !withoutJs.length) continue;
      found++;
      if (!withoutJs.length) {
        problems.push(`${name}: the link only appears with JavaScript.`);
        continue;
      }
      const page = ctx.page(withoutJs[0].href);
      if (page && loaded(page.noJs) && page.noJs.text.trim().length < MIN_TEXT) {
        problems.push(`${name}: ${ctx.short(page.url)} shows no text without JavaScript.`);
      }
    }
    if (!found) return skip("No imprint or privacy policy link found (see legal/*).");
    if (problems.length) {
      return fail("Mandatory information needs JavaScript. Visitors without it, and many crawlers, cannot find it.", problems);
    }
    return pass("Both are linked and readable without JavaScript.");
  },
});

import { LEGAL_PAGES, defineCheck, loadYaml, loaded, msg, pageName, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const LAWS = loadYaml<Array<{ old: string; now: string; label: string; name: string }>>("data/outdated-laws.yml").map((l) => ({
  ...l,
  old: new RegExp(l.old),
  now: new RegExp(l.now),
}));

export default defineCheck({
  run(ctx) {
    const pages = LEGAL_PAGES.map(({ concept }) => ({ concept, page: ctx.legalPage(concept)?.page })).filter(
      (p) => p.page && loaded(p.page.js),
    );
    if (!pages.length) return skip(msg("no_pages"));
    const found: Finding[] = pages.flatMap(({ concept, page }) =>
      LAWS.filter((l) => l.old.test(page!.js.text) && !l.now.test(page!.js.text)).map((l) => ({
        key: "outdated",
        params: { page: pageName(concept), old: l.label, now: l.name },
      })),
    );
    if (found.length) return warn(msg("found", { count: found.length }), found);
    return pass(msg("none"));
  },
});

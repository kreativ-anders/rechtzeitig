import { capped, defineCheck, info, jsIncomplete, msg, pageLinks, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const pages = ctx.observedPages;
    if (!pages.length) return skip(msg("no_pages"));
    const found: Finding[] = [];
    for (const page of pages) {
      const links = pageLinks(page).filter((l) => !l.hidden);
      // Buttons of a consent banner are privacy/consent-equal-choice's; other dialogs (newsletter, discount, exit intent) count here.
      const consent = ctx.links("consent_accept", links.filter((l) => l.area === "banner")).length > 0;
      for (const l of links) {
        if (consent && l.area === "banner") continue;
        if (ctx.says("shaming", l.text)) found.push({ key: "found_on", params: { where: ctx.short(page.url), text: l.text } });
      }
    }
    const list = unique(found, (f) => `${f.params?.where}\n${f.params?.text}`);
    if (list.length) return warn(msg("found", { count: list.length }), capped(list));
    // Pop-ups are added by scripts: a page without its load with JavaScript was not seen with them.
    return jsIncomplete(ctx, info) ?? pass(msg("none", { count: pages.length }));
  },
});

import { capped, defineCheck, info, jsIncomplete, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return jsIncomplete(ctx, info) ?? skip(msg("no_pages"));
    // Nobody clicked and no account exists: a title that announces a message is never a real one.
    const found: Finding[] = ctx.sitePages.flatMap((p) => {
      const [first, ...later] = p.js.titles;
      const fake = [first, ...later].find((t) => t && ctx.says("fake_notification", t));
      if (!fake) return [];
      return [{ key: fake === first ? "at_load" : "changed", params: { where: ctx.short(p.url), title: fake, before: first ?? "" } }];
    });
    if (found.length) return warn(msg("found", { count: found.length }), capped(found));
    return jsIncomplete(ctx, info) ?? pass(msg("none", { count: ctx.sitePages.length }));
  },
});

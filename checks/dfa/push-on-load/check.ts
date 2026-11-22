import { capped, defineCheck, info, jsIncomplete, msg, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return jsIncomplete(ctx, info) ?? skip(msg("no_pages"));
    // The scan never clicks: every prompt it records was started by the page, not by the visitor.
    const found: Finding[] = unique(ctx.sitePages.flatMap((p) => p.js.prompts.map((x) => ({ ...x, where: ctx.short(p.url) }))), (x) => `${x.where}\n${x.api}\n${x.script}`)
      .map((x) => {
        let host = "";
        try {
          host = x.script ? new URL(x.script).hostname : "";
        } catch {
          // no script on the stack
        }
        const by = host ? (ctx.isThirdParty(host) ? (ctx.vendor(host)?.name ?? host) : ctx.short(x.script)) : "";
        return { key: by ? "prompt_by" : "prompt", params: { where: x.where, api: x.api, by } };
      });
    if (found.length) return warn(msg("found", { count: found.length }), capped(found));
    return jsIncomplete(ctx, info) ?? pass(msg("none", { count: ctx.sitePages.length }));
  },
});

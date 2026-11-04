import { defineCheck, fail, msg, pass, siteRequests, skip, unique, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.https) return skip(msg("no_https"));
    const insecure: Finding[] = unique(siteRequests(ctx).filter((r) => r.url.startsWith("http:")), (r) => `${r.url}\n${r.page}`)
      .map((r) => ({ key: "on_page", params: { url: r.url, page: r.page } }));
    if (insecure.length) return fail(msg("insecure", { count: insecure.length }), insecure);
    return pass(msg("all_https"));
  },
});

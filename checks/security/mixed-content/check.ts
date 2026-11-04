import { defineCheck, fail, msg, pass, siteRequests, skip, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.https) return skip(msg("no_https"));
    const seen = new Set<string>();
    const insecure: Finding[] = siteRequests(ctx)
      .filter((r) => r.url.startsWith("http:"))
      .filter((r) => !seen.has(`${r.url}\n${r.page}`) && !!seen.add(`${r.url}\n${r.page}`))
      .map((r) => ({ key: "on_page", params: { url: r.url, page: r.page } }));
    if (insecure.length) return fail(msg("insecure", { count: insecure.length }), insecure);
    return pass(msg("all_https"));
  },
});

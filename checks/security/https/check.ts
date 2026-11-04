import { defineCheck, fail, msg, pass, skip } from "../../../src/sdk.ts";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export default defineCheck({
  run(ctx) {
    if (!ctx.https) return fail(msg("no_https"));
    const http = ctx.http;
    if (!http) return skip(msg("not_checked"));
    if ("error" in http) return pass(msg("no_http"));
    if (REDIRECTS.has(http.status) && http.location.startsWith("https:")) return pass(msg("redirects"));
    return fail(msg("no_redirect", { status: http.status }));
  },
});

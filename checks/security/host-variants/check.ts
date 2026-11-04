import { defineCheck, info, msg, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const v = ctx.variant;
    if (!v) return skip(msg("no_variant"));
    const host = new URL(v.url).hostname;
    if ("error" in v) return warn(msg("no_answer", { host, error: v.error }));
    if (v.status >= 400) return warn(msg("http_error", { host, status: v.status }));
    if (new URL(v.finalUrl).hostname === host) return info(msg("no_redirect", { host, target: new URL(ctx.url).hostname }));
    return pass(msg("redirects", { host, target: new URL(v.finalUrl).hostname }));
  },
});

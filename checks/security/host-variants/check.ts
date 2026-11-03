import { defineCheck, info, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  title: "www and non-www addresses both work",
  run(ctx) {
    const v = ctx.variant;
    if (!v) return skip("The other address variant does not exist.");
    const host = new URL(v.url).hostname;
    if ("error" in v) return warn(`${host} exists in DNS but does not answer over HTTPS (${v.error}).`);
    if (v.status >= 400) return warn(`${host} answers with HTTP ${v.status}.`);
    if (new URL(v.finalUrl).hostname === host) return info(`${host} shows the site without redirecting to ${new URL(ctx.url).hostname}.`);
    return pass(`${host} redirects to ${new URL(v.finalUrl).hostname}.`);
  },
});

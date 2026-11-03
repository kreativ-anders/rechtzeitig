import { defineCheck, fail, pass, siteRequests, skip } from "../../../src/sdk.ts";

export default defineCheck({
  title: "No unencrypted resources on HTTPS pages",
  law: "Art. 32 GDPR",
  run(ctx) {
    if (!ctx.url.startsWith("https:")) return skip("The site does not use HTTPS (see security/https).");
    const insecure = [...new Set(siteRequests(ctx).filter((r) => r.url.startsWith("http:")).map((r) => `${r.url} on ${r.page}`))];
    if (insecure.length) return fail(`${insecure.length} resource(s) load over plain HTTP.`, insecure);
    return pass("All resources load over HTTPS.");
  },
});

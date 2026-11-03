import { defineCheck, fail, pass } from "../../../src/sdk.ts";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export default defineCheck({
  run(ctx) {
    if (!ctx.https) return fail("The site is not served over HTTPS.");
    const http = ctx.http;
    if (!http || "error" in http) return pass("Served over HTTPS. Plain HTTP is not offered.");
    if (REDIRECTS.has(http.status) && http.location.startsWith("https:")) {
      return pass("Served over HTTPS. Plain HTTP redirects to HTTPS.");
    }
    return fail(`Plain HTTP answers with ${http.status} instead of redirecting to HTTPS.`);
  },
});

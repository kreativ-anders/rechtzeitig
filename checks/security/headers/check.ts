import { defineCheck, pass, warn } from "../../../src/sdk.ts";

export default defineCheck({
  title: "Security headers are set",
  law: "Art. 32 GDPR",
  run(ctx) {
    const h = Object.keys(ctx.start.js.headers).length ? ctx.start.js.headers : ctx.start.noJs.headers;
    const csp = h["content-security-policy"] ?? "";
    const missing: string[] = [];
    if (ctx.url.startsWith("https:") && !h["strict-transport-security"]) missing.push("Strict-Transport-Security");
    if (!csp) missing.push("Content-Security-Policy");
    if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) missing.push("X-Content-Type-Options: nosniff");
    if (!h["referrer-policy"]) missing.push("Referrer-Policy");
    if (!h["x-frame-options"] && !/frame-ancestors/i.test(csp)) missing.push("X-Frame-Options or CSP frame-ancestors");
    if (missing.length) return warn(`${missing.length} security header(s) missing.`, missing);
    return pass("All common security headers are set.");
  },
});

import { defineCheck, pass, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const h = Object.keys(ctx.start.js.headers).length ? ctx.start.js.headers : ctx.start.noJs.headers;
    // Static hosts often cannot set headers. Browsers apply CSP and Referrer-Policy from <meta>, so those count.
    // frame-ancestors and nosniff are ignored in <meta>, so they still need real headers.
    const meta = ctx.start.noJs.status ? ctx.start.noJs.meta : ctx.start.js.meta;
    const csp = h["content-security-policy"] ?? "";
    const missing: string[] = [];
    if (ctx.url.startsWith("https:") && !h["strict-transport-security"]) missing.push("Strict-Transport-Security");
    if (!csp && !meta["content-security-policy"]) missing.push("Content-Security-Policy");
    if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) missing.push("X-Content-Type-Options: nosniff");
    if (!h["referrer-policy"] && !meta["referrer-policy"]) missing.push("Referrer-Policy");
    if (!h["x-frame-options"] && !/frame-ancestors/i.test(csp)) {
      missing.push(/frame-ancestors/i.test(meta["content-security-policy"] ?? "")
        ? "X-Frame-Options or CSP frame-ancestors (browsers ignore frame-ancestors in <meta>)"
        : "X-Frame-Options or CSP frame-ancestors");
    }
    const fromMeta = ["content-security-policy", "referrer-policy"].filter((n) => !h[n] && meta[n]);
    const note = fromMeta.length ? [`Set as <meta>: ${fromMeta.join(", ")}`] : [];
    if (missing.length) return warn(`${missing.length} security header(s) missing.`, [...missing, ...note]);
    return pass("All common security headers are set.", note);
  },
});

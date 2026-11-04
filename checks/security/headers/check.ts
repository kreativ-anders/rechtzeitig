import { defineCheck, loadYaml, msg, pass, startSnapshot, warn, type Finding } from "../../../src/sdk.ts";

const PRELOADED = new Set(loadYaml<{ tlds: string[] }>("data/hsts-preload.yml").tlds);

export default defineCheck({
  run(ctx) {
    const { headers: h, meta, finalUrl } = startSnapshot(ctx);
    // Static hosts often cannot set headers. Browsers apply CSP and Referrer-Policy from <meta>, so those count.
    // frame-ancestors and nosniff are ignored in <meta>, so they still need real headers.
    const csp = h["content-security-policy"] ?? "";
    const missing: Finding[] = [];
    const header = (text: string) => missing.push({ text });
    // Browsers load every site under a preloaded TLD over HTTPS only, so the header adds nothing there.
    const tld = new URL(finalUrl).hostname.split(".").pop() ?? "";
    const preloaded = ctx.https && !h["strict-transport-security"] && PRELOADED.has(tld);
    if (ctx.https && !h["strict-transport-security"] && !preloaded) header("Strict-Transport-Security");
    if (!csp && !meta["content-security-policy"]) header("Content-Security-Policy");
    if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) header("X-Content-Type-Options: nosniff");
    if (!h["referrer-policy"] && !meta["referrer-policy"]) header("Referrer-Policy");
    if (!h["x-frame-options"] && !/frame-ancestors/i.test(csp)) {
      missing.push({ key: /frame-ancestors/i.test(meta["content-security-policy"] ?? "") ? "frame_meta" : "frame" });
    }
    const fromMeta = ["content-security-policy", "referrer-policy"].filter((n) => !h[n] && meta[n]);
    const note: Finding[] = fromMeta.length ? [{ key: "from_meta", params: { names: fromMeta.join(", ") } }] : [];
    if (preloaded) note.push({ key: "hsts_preloaded", params: { tld } });
    if (missing.length) return warn(msg("missing", { count: missing.length }), [...missing, ...note]);
    return pass(msg("all_set"), note);
  },
});

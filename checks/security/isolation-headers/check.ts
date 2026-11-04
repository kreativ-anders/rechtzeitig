import { defineCheck, msg, pass, startSnapshot, warn, type Finding } from "../../../src/sdk.ts";

/** COOP values that separate the page from windows of other sites. unsafe-none is the default, so it counts as missing. */
const ISOLATING = ["same-origin", "same-origin-allow-popups", "noopener-allow-popups"];

export default defineCheck({
  run(ctx) {
    const { headers: h, meta } = startSnapshot(ctx);
    // Both policies exist only as headers; browsers ignore them in <meta>.
    const missing: Finding[] = [];
    if (!h["permissions-policy"]) {
      missing.push(meta["permissions-policy"] ? { key: "meta_ignored", params: { name: "Permissions-Policy" } } : { text: "Permissions-Policy" });
    }
    const coop = (h["cross-origin-opener-policy"] ?? "").split(";")[0].trim().toLowerCase();
    if (!ISOLATING.includes(coop)) {
      if (coop === "unsafe-none") missing.push({ key: "coop_unsafe" });
      else if (meta["cross-origin-opener-policy"]) missing.push({ key: "meta_ignored", params: { name: "Cross-Origin-Opener-Policy" } });
      else missing.push({ text: "Cross-Origin-Opener-Policy" });
      if (h["cross-origin-opener-policy-report-only"]) missing.push({ key: "coop_report_only" });
    }
    if (missing.length) return warn(msg("missing", { count: missing.filter((m) => m.key !== "coop_report_only").length }), missing);
    return pass(msg("all_set"));
  },
});

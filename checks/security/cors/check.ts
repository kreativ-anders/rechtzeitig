import { defineCheck, fail, msg, pass, skip, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return skip(msg("no_pages"));
    // Only what the documents answered to a plain visit; whether the server mirrors a foreign Origin
    // would need a request with that Origin, which the scan does not send.
    const problems: Finding[] = ctx.sitePages.flatMap((p) => {
      const h = (p.noJs.status > 0 ? p.noJs : p.js).headers;
      const origin = (h["access-control-allow-origin"] ?? "").trim().toLowerCase();
      const credentials = (h["access-control-allow-credentials"] ?? "").trim().toLowerCase() === "true";
      if (!credentials || (origin !== "*" && origin !== "null")) return [];
      return [{ key: origin === "*" ? "wildcard" : "null_origin", params: { page: ctx.short(p.url) } }];
    });
    if (problems.length) return fail(msg("credentials", { count: problems.length }), problems);
    return pass(msg("ok", { count: ctx.sitePages.length }));
  },
});

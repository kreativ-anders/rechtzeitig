import { defineCheck, fail, info, jsFailedPages, msg, pass, siteCookies, warn, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    const storage = new Set(ctx.sitePages.flatMap((p) => p.js.storage));

    const tracking = cookies.filter((c) => ctx.trackingCookie(c.name));
    const foreign = cookies.filter((c) => !ctx.trackingCookie(c.name) && ctx.isThirdParty(c.domain));
    const own = cookies.filter((c) => !ctx.trackingCookie(c.name) && !ctx.isThirdParty(c.domain));
    const where = (c: (typeof cookies)[number]) => ({ name: c.name, domain: c.domain, page: c.page });
    const details: Finding[] = [
      ...tracking.map((c) => ({ key: "tracking_cookie", params: { ...where(c), vendor: ctx.trackingCookie(c.name)?.name ?? "" } })),
      ...foreign.map((c) => ({ key: "third_party_cookie", params: where(c) })),
      ...own.map((c) => ({ key: "own_cookie", params: where(c) })),
      ...[...storage].map((key) => ({ key: "storage", params: { key } })),
    ];

    if (tracking.length) return fail(msg("tracking", { count: tracking.length }), details);
    if (foreign.length) return warn(msg("third_party", { count: foreign.length }), details);
    if (details.length) return info(msg("review", { count: details.length }), details);
    // Without the load with JavaScript, cookies and storage set by scripts are unknown: no pass on missing evidence.
    if (ctx.jsFailed.length) return warn(msg("incomplete", { count: ctx.jsFailed.length }), jsFailedPages(ctx));
    return pass(msg("none"));
  },
});

import { defineCheck, fail, info, pass, siteCookies, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    const storage = new Set(ctx.sitePages.flatMap((p) => p.js.storage));

    const tracking = cookies.filter((c) => ctx.trackingCookie(c.name));
    const foreign = cookies.filter((c) => !ctx.trackingCookie(c.name) && ctx.isThirdParty(c.domain));
    const own = cookies.filter((c) => !ctx.trackingCookie(c.name) && !ctx.isThirdParty(c.domain));
    const details = [
      ...tracking.map((c) => `${c.name} (${c.domain}, set on ${c.page}): tracking cookie of ${ctx.trackingCookie(c.name)?.name}`),
      ...foreign.map((c) => `${c.name} (${c.domain}, set on ${c.page}): third-party cookie`),
      ...own.map((c) => `${c.name} (${c.domain}, set on ${c.page})`),
      ...[...storage].map((key) => `localStorage: ${key}`),
    ];

    if (tracking.length) return fail(`${tracking.length} tracking cookie(s) set before consent.`, details);
    if (foreign.length) return warn(`${foreign.length} third-party cookie(s) set before consent.`, details);
    if (details.length) {
      return info(`${details.length} cookie(s) or storage entries set before consent. Without consent, only strictly necessary ones are allowed.`, details);
    }
    return pass("No cookies or local storage before consent.");
  },
});

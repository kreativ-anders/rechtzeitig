import { defineCheck, info, loadYaml, msg, pass, siteCookies, skip, warn, type Finding } from "../../../src/sdk.ts";

const MAX_DAYS = loadYaml<Record<string, { max_days: number }>>("data/thresholds.yml")["privacy/cookie-lifetime"].max_days;
const DAY_MS = 24 * 60 * 60 * 1000;

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    if (!cookies.length) return skip(msg("none"));
    const now = Date.now();
    const days = (expires: number) => Math.round((expires * 1000 - now) / DAY_MS);
    const long = cookies.filter((c) => c.expires > 0 && days(c.expires) > MAX_DAYS);
    // Like privacy/cookies-before-consent: known tracking cookies and cookies of other sites need consent.
    const needsConsent = (c: (typeof long)[number]) => !!ctx.trackingCookie(c.name) || ctx.isThirdParty(c.domain);
    const finding = (c: (typeof long)[number]): Finding => {
      const vendor = ctx.trackingCookie(c.name)?.name;
      const params = { name: c.name, domain: c.domain, page: c.page, days: days(c.expires) };
      return vendor ? { key: "tracking_cookie", params: { ...params, vendor } } : { key: "cookie", params };
    };
    const consent = long.filter(needsConsent);
    const own = long.filter((c) => !needsConsent(c));
    const details = [...consent, ...own].map(finding);
    if (consent.length) return warn(msg("too_long", { count: consent.length, max: MAX_DAYS }), details);
    if (own.length) return info(msg("own_long", { count: own.length, max: MAX_DAYS }), details);
    return pass(msg("within", { count: cookies.length, max: MAX_DAYS }));
  },
});

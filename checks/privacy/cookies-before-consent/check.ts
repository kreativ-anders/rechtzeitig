import { defineCheck, fail, info, pass, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const cookies = new Map<string, { name: string; domain: string; page: string }>();
    const storage = new Set<string>();
    for (const page of ctx.sitePages) {
      for (const c of [...page.noJs.cookies, ...page.js.cookies]) {
        const key = `${c.name}@${c.domain}`;
        if (!cookies.has(key)) cookies.set(key, { ...c, page: ctx.short(page.url) });
      }
      for (const key of page.js.storage) storage.add(key);
    }

    const tracking = [...cookies.values()].filter((c) => ctx.trackingCookie(c.name));
    const foreign = [...cookies.values()].filter((c) => !ctx.trackingCookie(c.name) && ctx.isThirdParty(c.domain));
    const own = [...cookies.values()].filter((c) => !ctx.trackingCookie(c.name) && !ctx.isThirdParty(c.domain));
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

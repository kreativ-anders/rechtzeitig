import { defineCheck, info, loaded, loadYaml, msg, pass, warn } from "../../../src/sdk.ts";

const ODR = new RegExp(loadYaml<{ odr: string[] }>("data/outdated-links.yml").odr.join("|"), "i");

export default defineCheck({
  run(ctx) {
    // A page whose load with JavaScript failed is read from its load without JavaScript; no page at all proves nothing.
    if (!ctx.observedPages.length) return info(msg("not_loaded"));
    const found = ctx.observedPages
      .map((p) => ({ p, s: loaded(p.js) ? p.js : p.noJs }))
      .filter(({ s }) => s.links.some((l) => ODR.test(l.href ?? "")) || ODR.test(s.text))
      .map(({ p }) => ({ text: ctx.short(p.url) }));
    if (found.length) return warn(msg("found"), found);
    return pass(msg("none"));
  },
});

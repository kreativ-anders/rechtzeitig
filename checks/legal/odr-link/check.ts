import { defineCheck, loadYaml, msg, pass, warn } from "../../../src/sdk.ts";

const ODR = new RegExp(loadYaml<{ odr: string[] }>("data/outdated-links.yml").odr.join("|"), "i");

export default defineCheck({
  run(ctx) {
    const found = ctx.sitePages
      .filter((p) => p.js.links.some((l) => ODR.test(l.href ?? "")) || ODR.test(p.js.text))
      .map((p) => ({ text: ctx.short(p.url) }));
    if (found.length) return warn(msg("found"), found);
    return pass(msg("none"));
  },
});

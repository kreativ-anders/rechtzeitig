import { defineCheck, pass, warn } from "../../../src/sdk.ts";

const ODR = /ec\.europa\.eu\/(consumers\/odr|odr)/i;

export default defineCheck({
  run(ctx) {
    const found = ctx.sitePages
      .filter((p) => p.js.links.some((l) => ODR.test(l.href ?? "")) || ODR.test(p.js.text))
      .map((p) => ctx.short(p.url));
    if (found.length) {
      return warn("The EU online dispute resolution platform closed on 20 July 2025. Remove the link and the notice about it.", found);
    }
    return pass("No outdated link to the EU dispute platform.");
  },
});

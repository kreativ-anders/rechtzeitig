import { defineCheck, fail, msg, pass, skip, startLinks } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    // A control the visitor cannot see or use is no choice.
    const banner = startLinks(ctx).filter((l) => l.area === "banner" && !l.hidden);
    const accept = ctx.links("consent_accept", banner);
    const reject = ctx.links("consent_reject", banner);
    if (!accept.length) return skip(msg("no_banner"));
    if (!reject.length) return fail(msg("no_reject", { accept: accept[0].text }));
    return pass(msg("both", { accept: accept[0].text, reject: reject[0].text }));
  },
});

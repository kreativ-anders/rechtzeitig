import { defineCheck, fail, pass, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const banner = [...ctx.start.js.links, ...ctx.start.noJs.links].filter((l) => l.area === "banner");
    const accept = ctx.links("consent_accept", banner);
    const reject = ctx.links("consent_reject", banner);
    if (!accept.length) return skip("No consent banner found on the start page.");
    if (!reject.length) {
      return fail(`The banner offers "${accept[0].text}" but no way to reject on the same layer. Rejecting must be as easy as accepting.`);
    }
    return pass(`The banner offers "${accept[0].text}" and "${reject[0].text}".`);
  },
});

import { defineCheck, linkedPageResult, msg, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    // T&Cs are not required, so a missing link only warns; linked T&Cs must open (§ 312i Abs. 1 Satz 1 Nr. 4 BGB).
    if (!ctx.legalPage("terms")) return warn(msg("no_link"));
    return linkedPageResult(ctx, "terms");
  },
});

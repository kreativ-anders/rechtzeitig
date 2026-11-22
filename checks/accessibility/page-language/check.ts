import { defineCheck, msg, pass, startSnapshot, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const lang = startSnapshot(ctx).lang.trim().toLowerCase();
    if (!lang) return warn(msg("missing"));
    return pass(msg("declared", { lang }));
  },
});

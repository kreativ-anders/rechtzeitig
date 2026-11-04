import { defineCheck, msg, pass, startSnapshot, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const lang = startSnapshot(ctx).lang.trim().toLowerCase();
    if (!lang) return warn(msg("missing"));
    const primary = lang.split("-")[0];
    if (!ctx.languages.includes(primary)) return warn(msg("mismatch", { lang, languages: ctx.languages.join(", ") }));
    return pass(msg("declared", { lang }));
  },
});

import { defineCheck, pass, startSnapshot, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const lang = startSnapshot(ctx).lang.trim().toLowerCase();
    if (!lang) return warn("The start page has no <html lang> attribute. Screen readers then have to guess the language.");
    const primary = lang.split("-")[0];
    if (!ctx.languages.includes(primary)) {
      return warn(`The page declares lang="${lang}", but the scan used ${ctx.languages.join(", ")}. Pick the matching language when you start the scan.`);
    }
    return pass(`The page declares lang="${lang}".`);
  },
});

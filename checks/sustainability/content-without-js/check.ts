import { defineCheck, pass, warn } from "../../../src/sdk.ts";

const MIN_SHARE = 0.2;

export default defineCheck({
  title: "Start page shows content without JavaScript",
  run(ctx) {
    const withJs = ctx.start.js.text.trim().length;
    const withoutJs = ctx.start.noJs.text.trim().length;
    if (withJs === 0 || withoutJs >= withJs * MIN_SHARE) {
      return pass(`Without JavaScript the start page shows ${withoutJs} of ${withJs} characters.`);
    }
    return warn(`Without JavaScript the start page shows only ${withoutJs} of ${withJs} characters.`, [
      "Render content as HTML on the server or at build time. It then works for every visitor and loads faster.",
    ]);
  },
});

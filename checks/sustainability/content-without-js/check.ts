import { defineCheck, msg, pass, warn } from "../../../src/sdk.ts";

const MIN_SHARE = 0.2;

export default defineCheck({
  run(ctx) {
    const withJs = ctx.start.js.text.trim().length;
    const withoutJs = ctx.start.noJs.text.trim().length;
    if (withJs === 0 || withoutJs >= withJs * MIN_SHARE) return pass(msg("shows", { shown: withoutJs, count: withJs }));
    return warn(msg("shows_only", { shown: withoutJs, count: withJs }), [{ key: "render_html" }]);
  },
});

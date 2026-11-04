import { defineCheck, loadYaml, msg, pass, warn } from "../../../src/sdk.ts";

const { min_share: MIN_SHARE } = loadYaml<Record<string, { min_share: number }>>("data/thresholds.yml")["sustainability/content-without-js"];

export default defineCheck({
  run(ctx) {
    const withJs = ctx.start.js.text.trim().length;
    const withoutJs = ctx.start.noJs.text.trim().length;
    if (withJs === 0 || withoutJs >= withJs * MIN_SHARE) return pass(msg("shows", { shown: withoutJs, count: withJs }));
    return warn(msg("shows_only", { shown: withoutJs, count: withJs }), [{ key: "render_html" }]);
  },
});

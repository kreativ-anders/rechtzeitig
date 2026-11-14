import { defineCheck, loaded, loadYaml, msg, pass, skip, warn } from "../../../src/sdk.ts";

const { min_share: MIN_SHARE } = loadYaml<Record<string, { min_share: number }>>("data/thresholds.yml")["sustainability/content-without-js"];

export default defineCheck({
  run(ctx) {
    // A failed load has no text: comparing it would pass a page nobody saw.
    if (!loaded(ctx.start.js) || !loaded(ctx.start.noJs)) return skip(msg("not_compared"));
    const withJs = ctx.start.js.text.trim().length;
    const withoutJs = ctx.start.noJs.text.trim().length;
    if (withJs === 0 || withoutJs >= withJs * MIN_SHARE) return pass(msg("shows", { shown: withoutJs, count: withJs }));
    return warn(msg("shows_only", { shown: withoutJs, count: withJs }), [{ key: "render_html" }]);
  },
});

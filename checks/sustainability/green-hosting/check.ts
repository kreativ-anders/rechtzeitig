import { defineCheck, msg, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const g = ctx.green;
    if (!g) return skip(msg("none"));
    // A failed lookup says nothing about the site.
    if ("error" in g) return skip(msg("failed", { host: g.host, error: g.error }));
    if (g.green) return pass(g.hostedBy ? msg("green_by", { host: g.host, provider: g.hostedBy }) : msg("green", { host: g.host }));
    return warn(msg("not_green", { host: g.host }), [{ key: "choose_green" }]);
  },
});

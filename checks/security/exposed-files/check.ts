import { defineCheck, fail, msg, pass } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const files = ctx.probes.filter((p) => p.kind === "file");
    const exposed = files.filter((p) => p.exposed);
    if (exposed.length) return fail(msg("exposed", { count: exposed.length }), exposed.map((p) => ({ text: p.path })));
    return pass(msg("none", { count: files.length }));
  },
});

import { defineCheck, fail, info, msg, pass, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const files = ctx.probes.filter((p) => p.kind === "file");
    if (!files.length) return skip(msg("not_probed"));
    const exposed = files.filter((p) => p.exposed);
    if (exposed.length) return fail(msg("exposed", { count: exposed.length }), exposed.map((p) => ({ text: p.path })));
    // A request that got no answer says nothing about the file: no pass on missing evidence.
    const unanswered = files.filter((p) => p.status === 0);
    if (unanswered.length) return info(msg("unanswered", { count: unanswered.length, total: files.length }), unanswered.map((p) => ({ text: p.path })));
    return pass(msg("none", { count: files.length }));
  },
});

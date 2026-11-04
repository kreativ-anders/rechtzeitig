import { defineCheck, fail, msg, pass, skip, startCheckboxes } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const boxes = startCheckboxes(ctx).filter((b) => ctx.says("consent_optional", b.label));
    if (!boxes.length) return skip(msg("no_categories"));
    const preselected = [...new Set(boxes.filter((b) => b.checked && !b.disabled).map((b) => b.label))];
    if (preselected.length) return fail(msg("preselected", { count: preselected.length }), preselected.map((text) => ({ text })));
    return pass(msg("unticked", { count: boxes.length }));
  },
});

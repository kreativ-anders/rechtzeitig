import { defineCheck, fail, pass, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const boxes = [...ctx.start.js.checkboxes, ...ctx.start.noJs.checkboxes].filter((b) => ctx.says("consent_optional", b.label));
    if (!boxes.length) return skip("No optional cookie categories found on the start page.");
    const preselected = [...new Set(boxes.filter((b) => b.checked && !b.disabled).map((b) => b.label))];
    if (preselected.length) return fail("Optional categories are ticked before the visitor chooses.", preselected);
    return pass(`${boxes.length} optional categor${boxes.length === 1 ? "y is" : "ies are"} unticked.`);
  },
});

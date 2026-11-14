import { axeResult, defineCheck, loadYaml } from "../../../src/sdk.ts";

const RULES = loadYaml<{ rules: Record<string, string[]> }>("data/accessibility.yml").rules["accessibility/best-practices"];
const MAX_LIVE = loadYaml<Record<string, { max_live_regions: number }>>("data/thresholds.yml")["accessibility/best-practices"].max_live_regions;

export default defineCheck({
  // Every live region is a match; a page only counts with more of them than the threshold.
  run: (ctx) => axeResult(ctx, RULES, (v) => v.rule !== "rechtzeitig-live-region" || v.count > MAX_LIVE),
});

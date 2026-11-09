import { axeResult, defineCheck, loadYaml } from "../../../src/sdk.ts";

const RULES = loadYaml<{ rules: Record<string, string[]> }>("data/accessibility.yml").rules["accessibility/alt-text"];

export default defineCheck({
  run: (ctx) => axeResult(ctx, RULES),
});

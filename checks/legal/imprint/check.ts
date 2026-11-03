import { defineCheck, linkedPageResult } from "../../../src/sdk.ts";

export default defineCheck({
  title: "Imprint is linked and reachable",
  law: "§ 5 DDG",
  run: (ctx) => linkedPageResult(ctx, "imprint", "imprint (Impressum)"),
});

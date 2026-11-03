import { defineCheck, linkedPageResult } from "../../../src/sdk.ts";

export default defineCheck({
  run: (ctx) => linkedPageResult(ctx, "imprint", "imprint (Impressum)"),
});

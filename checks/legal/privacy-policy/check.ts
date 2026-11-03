import { defineCheck, linkedPageResult } from "../../../src/sdk.ts";

export default defineCheck({
  title: "Privacy policy is linked and reachable",
  law: "Art. 12, 13 GDPR",
  run: (ctx) => linkedPageResult(ctx, "privacy", "privacy policy (Datenschutzerklärung)"),
});

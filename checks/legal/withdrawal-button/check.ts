import { defineCheck, msg, requiredButton, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sales) return skip(msg("not_needed"));
    // Wording from § 356a BGB ("Vertrag widerrufen", "Widerruf bestätigen") is in the messages.
    return requiredButton(ctx, { exact: "withdraw", similar: "withdraw_similar", confirm: "withdraw_confirm" });
  },
});

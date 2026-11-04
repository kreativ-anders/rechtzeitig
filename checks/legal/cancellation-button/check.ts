import { defineCheck, msg, requiredButton, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.subscriptions) return skip(msg("not_needed"));
    // Wording from § 312k BGB ("Verträge hier kündigen", "jetzt kündigen") is in the messages.
    return requiredButton(ctx, { exact: "cancel", similar: "cancel_similar", confirm: "cancel_confirm" });
  },
});

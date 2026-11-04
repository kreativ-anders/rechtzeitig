import { defineCheck, requiredButton } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    // Wording from § 356a BGB ("Vertrag widerrufen", "Widerruf bestätigen") is in the messages.
    return requiredButton(ctx, { exact: "withdraw", similar: "withdraw_similar", confirm: "withdraw_confirm" });
  },
});

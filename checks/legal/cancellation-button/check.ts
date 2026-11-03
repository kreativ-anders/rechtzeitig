import { defineCheck, requiredButton, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.subscriptions) {
      return skip("Only needed when visitors can sign up for subscriptions. Start the scan with subscriptions: true to check it.");
    }
    return requiredButton(ctx, {
      exact: "cancel",
      similar: "cancel_similar",
      confirm: "cancel_confirm",
      name: "cancellation",
      wording: "Verträge hier kündigen",
      confirmWording: "jetzt kündigen",
      confirmLaw: "§ 312k Abs. 2 Satz 2 BGB",
      missing: 'No cancellation button on the start page. The law asks for "Verträge hier kündigen".',
    });
  },
});

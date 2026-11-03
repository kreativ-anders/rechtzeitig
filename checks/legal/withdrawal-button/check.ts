import { defineCheck, requiredButton, skip } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sales) {
      return skip("Only needed when consumers buy or sign contracts on the site. Start the scan with sales: true to check it.");
    }
    return requiredButton(ctx, {
      exact: "withdraw",
      similar: "withdraw_similar",
      confirm: "withdraw_confirm",
      name: "withdrawal",
      wording: "Vertrag widerrufen",
      confirmWording: "Widerruf bestätigen",
      confirmLaw: "§ 356a Abs. 3 BGB",
      missing: 'No withdrawal function on the start page. Since 19 June 2026 the law asks for "Vertrag widerrufen".',
    });
  },
});

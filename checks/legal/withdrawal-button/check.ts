import { defineCheck, fail, loaded, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.sales) {
      return skip("Only needed when consumers buy or sign contracts on the site. Start the scan with sales: true to check it.");
    }
    const onStart = (concept: string) => [...ctx.links(concept, ctx.start.js), ...ctx.links(concept, ctx.start.noJs)];
    const exact = onStart("withdraw");
    const link = exact[0] ?? onStart("withdraw_similar")[0];
    if (!link) return fail('No withdrawal function on the start page. Since 19 June 2026 the law asks for "Vertrag widerrufen".');

    const problems: string[] = [];
    const target = ctx.page(link.href);
    if (link.href && loaded(target?.js) && !ctx.says("withdraw_confirm", target.js.text)) {
      problems.push(`${ctx.short(link.href)} has no confirmation button "Widerruf bestätigen" (§ 356a Abs. 3 BGB).`);
    }
    if (!exact.length) return warn(`Found "${link.text}", but the law asks for "Vertrag widerrufen" or equally clear wording.`, problems);
    if (problems.length) return warn(`Found "${link.text}", but the withdrawal page looks incomplete.`, problems);
    return pass(`Found "${link.text}".`);
  },
});

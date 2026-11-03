import { defineCheck, fail, loaded, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    if (!ctx.subscriptions) {
      return skip("Only needed when visitors can sign up for subscriptions. Start the scan with subscriptions: true to check it.");
    }
    const onStart = (concept: string) => [...ctx.links(concept, ctx.start.js), ...ctx.links(concept, ctx.start.noJs)];
    const exact = onStart("cancel");
    const link = exact[0] ?? onStart("cancel_similar")[0];
    if (!link) return fail('No cancellation button on the start page. The law asks for "Verträge hier kündigen".');

    const problems: string[] = [];
    const target = ctx.page(link.href);
    if (link.href && loaded(target?.js) && !ctx.says("cancel_confirm", target.js.text)) {
      problems.push(`${ctx.short(link.href)} has no confirmation button "jetzt kündigen" (§ 312k Abs. 2 Satz 2 BGB).`);
    }
    if (!exact.length) {
      return warn(`Found "${link.text}", but the law asks for "Verträge hier kündigen" or equally clear wording.`, problems);
    }
    if (problems.length) return warn(`Found "${link.text}", but the cancellation page looks incomplete.`, problems);
    return pass(`Found "${link.text}".`);
  },
});

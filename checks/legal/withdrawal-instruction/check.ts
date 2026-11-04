import { defineCheck, loaded, msg, pageLinks, pass, warn, type Finding, type Page, type ScanContext } from "../../../src/sdk.ts";

/** The withdrawal instructions: their own page, else the T&Cs when they contain them. */
function instructions(ctx: ScanContext): { page: Page; inTerms: boolean } | undefined {
  const own = ctx.legalPage("withdrawal_info")?.page;
  if (own && loaded(own.js)) return { page: own, inTerms: false };
  const terms = ctx.legalPage("terms")?.page;
  if (terms && loaded(terms.js) && ctx.says("withdrawal_instruction", terms.js.text)) return { page: terms, inTerms: true };
  return undefined;
}

export default defineCheck({
  run(ctx) {
    const found = instructions(ctx);
    if (!found) return warn(msg("no_page"));
    const { page, inTerms } = found;
    const where = ctx.short(page.url);
    const text = page.js.text;
    // The model form may be in the text or behind a link, often a PDF.
    const modelForm = ctx.says("model_form", text) || pageLinks(page).some((l) => ctx.says("model_form", l.label));
    const missing: Finding[] = [];
    if (!modelForm) missing.push({ key: "no_model_form", params: { where } });
    if (!ctx.says("withdraw_function_hint", text)) missing.push({ key: "no_function_hint", params: { where } });
    const notes: Finding[] = inTerms ? [{ key: "in_terms", params: { where } }] : [];
    if (missing.length) return warn(msg("incomplete", { count: missing.length }), [...notes, ...missing]);
    return pass(msg("complete", { where }), notes);
  },
});

import { capped, contrast, defineCheck, info, jsIncomplete, loadYaml, msg, pass, skip, warn, type Finding, type OfferText } from "../../../src/sdk.ts";

const PRICE = loadYaml<{ price: string[] }>("data/shop.yml").price.map((p) => new RegExp(p, "i"));
const LIMITS = loadYaml<Record<string, { min_font_ratio: number; min_contrast: number }>>("data/thresholds.yml")["dfa/renewal-prominence"];
const round = (n: number) => Math.round(n * 10) / 10;

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return jsIncomplete(ctx, info) ?? skip(msg("no_pages"));
    const problems: Finding[] = [];
    const missing: Finding[] = [];
    let priced = 0;
    for (const page of ctx.sitePages) {
      const { textSize, blocks } = page.js.offers;
      const terms = (b: OfferText) => ctx.says("auto_renewal", b.text) || ctx.says("free_trial", b.text);
      // A subscription price: a price and a period in one block ("9,99 € / Monat").
      const price = blocks.find((b) => PRICE.some((re) => re.test(b.text)) && ctx.says("price_period", b.text));
      if (!price) continue;
      priced++;
      const where = ctx.short(page.url);
      const said = blocks.filter(terms);
      if (!said.length) {
        missing.push({ key: "missing", params: { where, price: price.text.slice(0, 80) } });
        continue;
      }
      // The most visible statement counts: the same terms may also stand in a footnote.
      const small = (b: OfferText) => b.fontSize < textSize * LIMITS.min_font_ratio;
      const faint = (b: OfferText) => (contrast(b) ?? Infinity) < LIMITS.min_contrast;
      if (said.some((b) => !small(b) && !faint(b))) continue;
      const b = said[0];
      problems.push(small(b)
        ? { key: "small", params: { where, text: b.text.slice(0, 120), size: round(b.fontSize), text_size: round(textSize) } }
        : { key: "faint", params: { where, text: b.text.slice(0, 120), ratio: round(contrast(b)!) } });
    }
    if (problems.length) return warn(msg("found", { count: problems.length }), capped([...problems, ...missing]));
    if (missing.length) return info(msg("not_said", { count: missing.length }), capped(missing));
    if (!priced) return jsIncomplete(ctx, info) ?? skip(msg("none", { count: ctx.sitePages.length }));
    return jsIncomplete(ctx, info) ?? pass(msg("visible", { count: priced }));
  },
});

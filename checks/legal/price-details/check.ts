import { defineCheck, loadYaml, msg, pageLinks, pass, skip, startLinks, unique, warn, type Finding, type Page, type ScanContext } from "../../../src/sdk.ts";

const SHOP = loadYaml<Record<"price" | "quantity" | "unit_price", string[]>>("data/shop.yml");
const anyOf = (patterns: string[]) => new RegExp(patterns.join("|"), "i");
const PRICE = anyOf(SHOP.price);
const QUANTITY = anyOf(SHOP.quantity);
const UNIT_PRICE = anyOf(SHOP.unit_price);
// Legal pages and the shipping cost page show amounts too (share capital, fees), but offer nothing.
const NOT_OFFERS = ["imprint", "privacy", "terms", "withdrawal_info"];

const flat = (text: string) => text.replace(/\s+/g, " ");

/** Pages behind legal and shipping links of the start page. */
function infoPages(ctx: ScanContext): Set<Page> {
  const links = startLinks(ctx).filter((l) => NOT_OFFERS.some((c) => ctx.links(c, [l]).length) || ctx.says("shipping_costs", l.label));
  return new Set(links.map((l) => ctx.page(l.href)).filter((p): p is Page => !!p && p !== ctx.start));
}

export default defineCheck({
  run(ctx) {
    const skipped = infoPages(ctx);
    // A shop page shows a price with cents and has a cart, checkout or buy link or button.
    const shopPages = ctx.sitePages.filter(
      (p) => !skipped.has(p) && PRICE.test(flat(p.js.text)) && pageLinks(p).some((l) => ctx.says("shop", l.label)),
    );
    if (!shopPages.length) return skip(msg("none", { count: ctx.sitePages.length }));

    const problems: Finding[] = [];
    const notes: Finding[] = [];
    for (const page of shopPages) {
      const text = flat(page.js.text);
      const where = ctx.short(page.url);
      if (!ctx.says("vat_included", text)) problems.push({ key: "no_vat", params: { where } });
      if (!ctx.says("shipping_costs", text) && !pageLinks(page).some((l) => ctx.says("shipping_costs", l.label))) {
        problems.push({ key: "no_shipping", params: { where } });
      }
      const quantity = QUANTITY.exec(text)?.[0];
      if (quantity && !UNIT_PRICE.test(text) && !ctx.says("base_price", text)) problems.push({ key: "no_base_price", params: { where, quantity } });
      const struck = unique([...page.js.struck, ...page.noJs.struck].map(flat), (s) => s).filter((s) => PRICE.test(s));
      if (struck.length && !ctx.says("lowest_price", text)) {
        if (ctx.says("rrp", text)) notes.push({ key: "rrp", params: { where, price: struck[0] } });
        else problems.push({ key: "no_lowest_price", params: { where, price: struck[0] } });
      }
    }
    if (problems.length) return warn(msg("missing", { count: problems.length }), [...problems, ...notes]);
    return pass(msg("complete", { count: shopPages.length }), notes);
  },
});

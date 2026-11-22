import { capped, defineCheck, info, jsIncomplete, loadYaml, msg, pageLinks, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

const PRICE = new RegExp(loadYaml<{ price: string[] }>("data/shop.yml").price.join("|"), "i");
const flat = (text: string) => text.replace(/\s+/g, " ");

export default defineCheck({
  run(ctx) {
    // Shop pages as legal/price-details finds them: a price with cents and a cart, checkout or buy link.
    const shopPages = ctx.sitePages.filter((p) => PRICE.test(flat(p.js.text)) && pageLinks(p).some((l) => ctx.says("shop", l.label)));
    if (!shopPages.length) return skip(msg("none", { count: ctx.sitePages.length }));
    const found: Finding[] = shopPages.flatMap((page) => {
      const struck = unique([...page.js.struck, ...page.noJs.struck].map(flat), (s) => s).filter((s) => PRICE.test(s));
      return struck.length && ctx.says("rrp", page.js.text) ? [{ key: "rrp", params: { where: ctx.short(page.url), price: struck[0] } }] : [];
    });
    if (found.length) return warn(msg("found", { count: found.length }), capped(found));
    // Struck-through prices are read from the rendered page: a page without its load with JavaScript was not seen.
    return jsIncomplete(ctx, info) ?? pass(msg("no_rrp", { count: shopPages.length }));
  },
});

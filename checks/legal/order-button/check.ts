import { defineCheck, fail, info, loadYaml, msg, pageLinks, pass, skip, unique, warn, type Finding, type Link, type Page, type ScanContext, type Status } from "../../../src/sdk.ts";

const ADDRESS = loadYaml<{ address_field: string[] }>("data/shop.yml").address_field.map((p) => new RegExp(p, "i"));
const asksAddress = (fields: string[]) => fields.some((f) => ADDRESS.some((re) => re.test(f)));

// Without arrows, icons and punctuation, so the patterns in lang/*.yml can match the whole button text.
const words = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** What one page says about its order button, or undefined when it has none. */
function judge(ctx: ScanContext, page: Page): { status: Status; finding: Finding } | undefined {
  const where = ctx.short(page.url);
  const says = (concept: string) => (l: Link) => ctx.says(concept, words(l.text));
  // A checkout page names a payment method and a total; its buttons include the final one.
  // Elsewhere only buttons of forms that ask for a postal address count, such as a one-page order form.
  const checkout = ctx.says("checkout_payment", page.js.text) && ctx.says("checkout_total", page.js.text);
  const forms = [...page.js.forms, ...page.noJs.forms].filter((f) => asksAddress(f.fields));
  const buttons = unique(
    (checkout ? pageLinks(page) : forms.flatMap((f) => f.links)).filter((l) => l.button && l.text),
    (l) => l.text,
  );
  const good = buttons.find(says("order_button"));
  if (good) return { status: "pass", finding: { key: "ok", params: { where, text: good.text } } };
  const wrong = buttons.find(says("order_wrong"));
  if (wrong) return { status: checkout ? "fail" : "warn", finding: { key: checkout ? "wrong" : "wrong_form", params: { where, text: wrong.text } } };
  if (!checkout) return undefined;
  const generic = buttons.find(says("order_generic"));
  if (generic) return { status: "warn", finding: { key: "generic", params: { where, text: generic.text } } };
  return { status: "info", finding: { key: "unrecognized", params: { where } } };
}

export default defineCheck({
  run(ctx) {
    const found = ctx.sitePages.map((p) => judge(ctx, p)).filter((j) => !!j);
    const details = found.map((j) => j.finding);
    const count = (status: Status) => found.filter((j) => j.status === status).length;
    if (count("fail")) return fail(msg("wrong_found", { count: count("fail") }), details);
    if (count("warn")) return warn(msg("unclear", { count: count("warn") }), details);
    if (count("pass")) return pass(msg("found", { count: count("pass") }), details);
    if (count("info")) return info(msg("not_recognized"), details);
    return skip(msg("none", { count: ctx.sitePages.length }));
  },
});

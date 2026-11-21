import { capped, defineCheck, info, loaded, msg, pageLinks, pass, skip, startLinks, warn, type Finding, type Page, type ScanContext } from "../../../src/sdk.ts";

// schema.org review markup in JSON-LD or microdata of the served document.
const MARKUP = /["']@type["']\s*:\s*["'](?:AggregateRating|Review)["']|itemtype=["']https?:\/\/schema\.org\/(?:AggregateRating|Review)["']/;

const textOf = (p: Page) => (loaded(p.js) ? p.js.text : p.noJs.text);

/** How the page shows reviews: markup, a count or star rating in the text, or a review widget; undefined when not at all. */
function reviewsOn(ctx: ScanContext, page: Page): "markup" | "text" | { widget: string } | undefined {
  const urls = new Set([page.url, page.js.finalUrl, page.noJs.finalUrl]);
  if (ctx.code.some((c) => c.type === "document" && urls.has(c.url) && MARKUP.test(c.body))) return "markup";
  if (ctx.says("review_count", textOf(page))) return "text";
  const hosts = [...page.js.requests, ...page.noJs.requests].map((r) => r.host).filter((h) => ctx.isThirdParty(h));
  const widget = hosts.map((h) => ctx.vendor(h)).find((v) => v?.purpose === "reviews and trust badge");
  return widget ? { widget: widget.name } : undefined;
}

export default defineCheck({
  run(ctx) {
    const terms = ctx.legalPage("terms");
    const faqLinks = startLinks(ctx, "faq").filter((l) => l.href);
    const faqs = ctx.observedPages.filter((p) => faqLinks.some((l) => ctx.page(l.href) === p));
    const infoPages = new Set([terms?.page, ...faqs].filter((p): p is Page => !!p));
    const shown = ctx.observedPages.filter((p) => !infoPages.has(p)).flatMap((p) => {
      const how = reviewsOn(ctx, p);
      return how ? [{ page: p, how }] : [];
    });
    if (!shown.length) return skip(msg("no_reviews", { count: ctx.observedPages.length }));

    // A note on one of the info pages covers every page.
    const noted = [...infoPages].find((p) => ctx.says("review_check", textOf(p)));
    if (noted) return pass(msg("noted", { where: ctx.short(noted.url) }));
    const missing: Finding[] = [];
    const widgetOnly: Finding[] = [];
    for (const { page, how } of shown) {
      if (ctx.says("review_check", textOf(page))) continue;
      const where = ctx.short(page.url);
      if (typeof how === "object") widgetOnly.push({ key: "widget", params: { where, name: how.widget } });
      else missing.push({ key: how === "markup" ? "no_note_markup" : "no_note_text", params: { where } });
    }
    if (!missing.length && !widgetOnly.length) return pass(msg("noted_pages", { count: shown.length }));
    // Pages that may hold the note but were not read: no warning on missing evidence.
    const unread: Finding[] = [
      ...(terms && !loaded(terms.page?.js) && !loaded(terms.page?.noJs) ? [{ key: "unread", params: { page: msg("page_terms"), where: ctx.short(terms.link.href ?? "") } }] : []),
      ...faqLinks.filter((l) => !faqs.includes(ctx.page(l.href)!)).slice(0, 1).map((l) => ({ key: "unread", params: { page: msg("page_faq"), where: ctx.short(l.href ?? "") } })),
    ];
    if (unread.length) return info(msg("not_read", { count: missing.length + widgetOnly.length }), capped([...missing, ...widgetOnly, ...unread]));
    if (!missing.length) return info(msg("widget_only", { count: widgetOnly.length }), capped(widgetOnly));
    return warn(msg("missing", { count: missing.length }), capped([...missing, ...widgetOnly]));
  },
});

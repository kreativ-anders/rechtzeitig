import { capped, defineCheck, isWebUrl, loadYaml, msg, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

/** Smaller images (tracking pixels, icons) are not worth deferring. CSS pixels. */
const { min_size: MIN_SIZE } = loadYaml<Record<string, { min_size: number }>>("data/thresholds.yml")["sustainability/lazy-loading"];

export default defineCheck({
  run(ctx) {
    // Script-based lazy loading (lazysizes, data-src) shows a data: placeholder until scrolling; isWebUrl drops it.
    const images = unique(
      ctx.sitePages.flatMap((p) => p.js.images.map((i) => ({ ...i, page: ctx.short(p.url) }))),
      (i) => i.url,
    ).filter((i) => i.belowFold && isWebUrl(i.url) && i.width >= MIN_SIZE && i.height >= MIN_SIZE);
    if (!images.length) return skip(msg("none"));
    const eager = images.filter((i) => i.loading !== "lazy");
    if (!eager.length) return pass(msg("lazy", { count: images.length }));
    const details: Finding[] = capped(eager.map((i) => ({ key: "image", params: { url: ctx.short(i.url), page: i.page } })));
    return warn(msg("eager", { count: eager.length, total: images.length }), details);
  },
});

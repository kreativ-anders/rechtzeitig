import { capped, defineCheck, isWebUrl, loadYaml, msg, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

const MOVING = loadYaml<{ moving: string[] }>("data/subresource-integrity.yml").moving;

/** The host belongs to a service whose files change under the same URL. */
const moving = (host: string) => MOVING.some((d) => host === d || host.endsWith(`.${d}`));

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return skip(msg("no_pages"));
    // The load without JavaScript holds the elements as written in the HTML. Scripts that other scripts
    // add later (a tag manager loading its tags) are not the site's to sign.
    const files = unique(
      ctx.sitePages.flatMap((p) => p.noJs.subresources),
      (s) => s.url,
    ).filter((s) => isWebUrl(s.url) && ctx.isThirdParty(new URL(s.url).hostname));
    if (!files.length) return pass(msg("no_foreign"));
    // Every file without a hash counts, also from services that change their files under the same URL:
    // the risk is the same. For those the finding says how to fix it, since a hash would break them.
    const missing = files.filter((s) => !s.integrity);
    if (!missing.length) return pass(msg("signed", { count: files.length }));
    const note: Finding[] = unique(missing.filter((s) => moving(new URL(s.url).hostname)), (s) => new URL(s.url).hostname).map((s) => ({
      key: "moving",
      params: { host: new URL(s.url).hostname },
    }));
    const details: Finding[] = capped(missing.map((s) => ({ key: s.type, params: { url: s.url } })));
    return warn(msg("unsigned", { count: missing.length, total: files.length }), [...details, ...note]);
  },
});

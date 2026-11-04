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
    const unsigned = files.filter((s) => !s.integrity);
    const excluded = unsigned.filter((s) => moving(new URL(s.url).hostname));
    const missing = unsigned.filter((s) => !excluded.includes(s));
    const note: Finding[] = unique(excluded, (s) => new URL(s.url).hostname).map((s) => ({
      key: "moving",
      params: { host: new URL(s.url).hostname },
    }));
    if (!missing.length) return pass(msg("signed", { count: files.length - excluded.length }), note);
    const details: Finding[] = capped(missing.map((s) => ({ key: s.type, params: { url: s.url } })));
    return warn(msg("unsigned", { count: missing.length, total: files.length }), [...details, ...note]);
  },
});

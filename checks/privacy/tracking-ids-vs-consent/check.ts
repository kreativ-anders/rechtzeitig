import { CODE_FILES, capped, consentInRepo, consentOnSite, defineCrossCheck, fail, grepFiles, info, msg, pass, siteRequests, skip, warn, type Finding, type Vendor } from "../../../src/sdk.ts";

export default defineCrossCheck({
  run(ctx, repo) {
    // Repository side: tag and account ids of known vendors (`ids` in data/third-parties.yml), first place per id.
    const rules = ctx.vendors.flatMap((vendor) => (vendor.ids ?? []).map((p) => ({ vendor, re: new RegExp(p) })));
    const { matches, unread } = grepFiles(repo, CODE_FILES, rules.map((r) => r.re));
    const ids = new Map<string, { vendor: Vendor; file: string; line: number }>();
    for (const m of matches) {
      const id = m.match[1] ?? m.match[0];
      if (!ids.has(id)) ids.set(id, { vendor: rules[m.pattern].vendor, file: m.file, line: m.line });
    }
    if (!ids.size) return unread.length ? info(msg("unread", { count: unread.length })) : skip(msg("no_ids"));

    // Website side: requests made without any click carry the id, so the tag ran before consent.
    const requests = siteRequests(ctx);
    const before: Finding[] = [];
    const notSeen: Finding[] = [];
    for (const [id, at] of ids) {
      const hit = requests.find((r) => r.url.includes(id));
      const where = { file: at.file, line: at.line, params: { vendor: at.vendor.name, id } };
      if (hit) before.push({ ...where, key: "loaded", params: { ...where.params, page: hit.page } });
      else notSeen.push({ ...where, key: "not_seen" });
    }
    if (before.length) return fail(msg("before_consent", { count: before.length }), capped(before));

    // Not loaded on the visited pages. Without any consent tool on the site or in the repository,
    // the pages that load these ids (not visited) have nothing that could hold them back.
    const site = consentOnSite(ctx);
    const tool = consentInRepo(repo);
    const anyTool = site.banner || site.platforms.length > 0 || tool.packages.length > 0 || tool.scripts.length > 0;
    if (!anyTool) return warn(msg("no_consent_tool", { count: notSeen.length }), capped(notSeen));
    return pass(msg("held_back", { count: notSeen.length }), capped(notSeen.map((f) => ({ ...f, key: "held" }))));
  },
});

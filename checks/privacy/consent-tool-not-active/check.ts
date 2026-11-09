import { capped, consentInRepo, consentOnSite, defineCrossCheck, fail, info, msg, pass, skip, thirdPartyServices, warn, type Finding } from "../../../src/sdk.ts";

export default defineCrossCheck({
  run(ctx, repo) {
    const tool = consentInRepo(repo);
    const inRepo: Finding[] = [
      ...tool.scripts.map((s) => ({ file: s.file, line: s.line, key: "script" })),
      ...tool.packages.map((p) => ({ file: p.file, line: p.line, key: "package", params: { package: p.name } })),
    ];
    if (!inRepo.length) return tool.unread.length ? info(msg("unread", { count: tool.unread.length })) : skip(msg("no_tool"));

    const site = consentOnSite(ctx);
    if (site.banner) return pass(msg("active"));
    // Services that need consent and loaded anyway; consent platforms themselves do not count.
    const trackers = [...thirdPartyServices(ctx).values()].filter((s) => s.vendor?.consent === "required");
    if (!trackers.length) return pass(msg("nothing_loads"));
    const names = trackers.map((s) => s.name).join(", ");
    const loads: Finding[] = trackers.map((s) => ({ key: "tracker", params: { name: s.name, pages: [...s.pages].join(", ") } }));

    // The platform's script loaded, but no banner was seen: it may sit in an iframe or a closed shadow root.
    if (site.platforms.length) return warn(msg("no_banner_platform", { platforms: site.platforms.join(", "), names }), capped([...inRepo, ...loads]));
    // The repository loads a hosted platform that the site never contacted: the tag is not deployed or not on these pages.
    if (tool.scripts.length) return fail(msg("not_loaded", { names }), capped([...inRepo, ...loads]));
    // A self-hosted library: its banner should be in the page, but the scan saw none.
    return warn(msg("no_banner_library", { names }), capped([...inRepo, ...loads]));
  },
});

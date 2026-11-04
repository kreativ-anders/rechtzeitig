import { defineCheck, info, loaded, msg, pageLinks, pass, skip, startLinks, warn, type Link } from "../../../src/sdk.ts";

const name = (l: Link) => l.text || l.label;

export default defineCheck({
  run(ctx) {
    const links = startLinks(ctx);
    if (!ctx.links("consent_accept", links.filter((l) => l.area === "banner")).length) return skip(msg("no_banner"));
    const settings = ctx.links("consent_settings", links);
    const outside = settings.find((l) => l.area !== "banner");
    if (outside) return pass(msg("found", { text: name(outside) }));
    const privacy = ctx.legalPage("privacy")?.page;
    const inPolicy = privacy && loaded(privacy.js) ? ctx.links("consent_settings", pageLinks(privacy))[0] : undefined;
    if (privacy && inPolicy) return info(msg("privacy_only", { text: name(inPolicy), where: ctx.short(privacy.url) }));
    if (settings.length) return info(msg("banner_only", { text: name(settings[0]) }));
    return warn(msg("missing"));
  },
});

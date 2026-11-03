import { defineCheck, loadedPage, pass, siteRequests, skip, warn } from "../../../src/sdk.ts";

// EU member states plus Iceland, Liechtenstein and Norway.
const EEA = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK IS LI NO".split(" "));

export default defineCheck({
  run(ctx) {
    const policy = loadedPage(ctx, "privacy");
    if (!policy) return skip("No privacy policy to read (see legal/privacy-policy).");

    const outside = new Map<string, string>();
    const unknown = new Set<string>();
    for (const { host } of siteRequests(ctx)) {
      if (!ctx.isThirdParty(host)) continue;
      const vendor = ctx.vendor(host);
      const country = ctx.countries[host] ?? vendor?.country;
      if (!country) unknown.add(host);
      else if (!EEA.has(country)) outside.set(vendor?.name ?? host, country);
    }
    const notes = unknown.size
      ? [`Country unknown for ${[...unknown].join(", ")}. Set the ipinfo-token input to look it up.`]
      : [];
    const list = [...outside].map(([name, country]) => `${name} (${country})`);

    if (!outside.size) return pass("No service outside the EU/EEA detected.", notes);
    if (ctx.says("third_country", policy.js.text)) return pass(`The privacy policy covers transfers outside the EU/EEA.`, [...list, ...notes]);
    return warn(`${outside.size} service(s) outside the EU/EEA, but the privacy policy does not mention third countries.`, [...list, ...notes]);
  },
});

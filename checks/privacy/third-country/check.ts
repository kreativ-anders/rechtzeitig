import { defineCheck, loadYaml, needLegalPage, pass, thirdPartyServices, warn } from "../../../src/sdk.ts";

const EEA = new Set(loadYaml<{ eea: string[] }>("data/countries.yml").eea);

export default defineCheck({
  run(ctx) {
    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;

    const outside = new Map<string, string>();
    const unknown = new Set<string>();
    for (const service of thirdPartyServices(ctx).values()) {
      const country = [...service.hosts].map((h) => ctx.countries[h]).find(Boolean) ?? service.vendor?.country;
      if (!country) unknown.add(service.name);
      else if (!EEA.has(country)) outside.set(service.name, country);
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

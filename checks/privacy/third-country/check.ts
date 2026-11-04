import { defineCheck, info, loadYaml, msg, needLegalPage, pass, thirdPartyServices, warn, type Finding } from "../../../src/sdk.ts";

const EEA = new Set(loadYaml<{ eea: string[] }>("data/countries.yml").eea);

export default defineCheck({
  run(ctx) {
    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;

    const outside = new Map<string, string>();
    const unknown = new Set<string>();
    const services = thirdPartyServices(ctx);
    for (const service of services.values()) {
      // The company's country decides, not where its nearest edge server stands.
      const country = service.vendor?.country ?? [...service.hosts].map((h) => ctx.countries[h]).find(Boolean);
      if (!country) unknown.add(service.name);
      else if (!EEA.has(country)) outside.set(service.name, country);
    }
    const known = services.size - unknown.size;
    const notes: Finding[] = unknown.size ? [{ key: "country_unknown", params: { names: [...unknown].join(", ") } }] : [];
    const list: Finding[] = [...outside].map(([name, country]) => ({ text: `${name} (${country})` }));

    if (!services.size) return pass(msg("no_services"));
    if (!known) return info(msg("all_unknown", { count: unknown.size }), notes);
    if (!outside.size) return pass(msg("none_outside"), notes);
    if (ctx.says("third_country", policy.js.text)) return pass(msg("covered"), [...list, ...notes]);
    return warn(msg("not_covered", { count: outside.size }), [...list, ...notes]);
  },
});

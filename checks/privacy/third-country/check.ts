import { defineCheck, info, loadYaml, msg, needLegalPage, pass, siteHosting, thirdPartyServices, warn, type Finding } from "../../../src/sdk.ts";

const EEA = new Set(loadYaml<{ eea: string[] }>("data/countries.yml").eea);

// The company's country decides, not where its nearest edge server stands: data/hosting.yml and
// data/third-parties.yml first, the IP country (IPinfo, only with ipinfo-token) for what they do not know.
export default defineCheck({
  run(ctx) {
    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;

    // Own hosting provider, by the start page's response headers. Whether the policy names it is privacy/hosting-in-policy's question.
    const hosting = siteHosting(ctx);
    const startHost = new URL(ctx.url).hostname;
    const ipCountry = hosting ? undefined : ctx.countries[startHost];

    const outside = new Map<string, string>();
    const unknown = new Set<string>();
    const services = [...thirdPartyServices(ctx).values()]
      // The hosting provider's own services (GitHub API on GitHub Pages, cdnjs on Cloudflare) are the same company: listed once.
      .filter((s) => !hosting || !s.vendor?.names.some((n) => hosting.provider.names.includes(n)));
    for (const service of services) {
      const country = service.vendor?.country ?? [...service.hosts].map((h) => ctx.countries[h]).find(Boolean);
      if (!country) unknown.add(service.name);
      else if (!EEA.has(country)) outside.set(service.name, country);
    }
    const known = services.length - unknown.size;
    const covered = ctx.says("third_country", policy.js.text);

    // The own host leads the details: by data/hosting.yml, else by IP country, else not recognized.
    const host: Finding = hosting
      ? { key: "host", params: { name: hosting.provider.name, country: hosting.provider.country, header: hosting.header } }
      : ipCountry
        ? { key: "host_by_ip", params: { host: startHost, country: ipCountry } }
        : { key: "host_unknown" };
    const details: Finding[] = [
      host,
      ...[...outside].map(([name, country]) => ({ text: `${name} (${country})` })),
      ...(unknown.size ? [{ key: "country_unknown", params: { names: [...unknown].join(", ") } }] : []),
    ];

    if (hosting && !EEA.has(hosting.provider.country)) {
      const { name, country } = hosting.provider;
      return covered ? pass(msg("covered"), details) : warn(msg("host_not_covered", { name, country }), details);
    }
    if (outside.size) return covered ? pass(msg("covered"), details) : warn(msg("not_covered", { count: outside.size }), details);
    // An IP country alone can be an edge server's, so it asks a person to look rather than warning.
    if (ipCountry && !EEA.has(ipCountry)) {
      return covered ? pass(msg("covered"), details) : info(msg("host_ip_outside", { host: startHost, country: ipCountry }), details);
    }
    if (services.length && !known) return info(msg("all_unknown", { count: unknown.size }), details);
    return pass(msg(services.length || hosting || ipCountry ? "none_outside" : "no_services"), details);
  },
});

import { CODE_FILES, capped, defineCrossCheck, grepFiles, info, isWebUrl, loadYaml, msg, needLegalPage, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const EEA = new Set(loadYaml<{ eea: string[] }>("data/countries.yml").eea);
const hostOf = (url: string) => {
  try {
    return isWebUrl(url) ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
};

interface Receiver {
  name: string;
  names: string[];
  country?: string;
  where: Finding;
}

export default defineCrossCheck({
  run(ctx, repo) {
    // Repository side: code that sends a form to a known receiver (`forms` in data/third-parties.yml), first line per receiver.
    const rules = ctx.vendors.flatMap((vendor) => (vendor.forms ?? []).map((p) => ({ vendor, re: new RegExp(p, "i") })));
    const { matches, unread } = grepFiles(repo, CODE_FILES, rules.map((r) => r.re));
    const receivers = new Map<string, Receiver>();
    for (const m of matches) {
      const v = rules[m.pattern].vendor;
      if (!receivers.has(v.name)) receivers.set(v.name, { name: v.name, names: v.names, country: v.country, where: { file: m.file, line: m.line, key: "in_code", params: { name: v.name } } });
    }
    // Website side: forms on the visited pages that send to another site whose host the repository names.
    for (const p of ctx.sitePages) {
      for (const f of p.js.forms) {
        const host = hostOf(f.action);
        if (!host || !ctx.isThirdParty(host)) continue;
        const vendor = ctx.vendor(host);
        const name = vendor?.name ?? host;
        if (receivers.has(name)) continue;
        const named = grepFiles(repo, CODE_FILES, [new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]).matches[0];
        if (!vendor?.forms && !named) continue; // a receiver only the website shows is for a website check
        const where: Finding = named
          ? { file: named.file, line: named.line, key: "form_to", params: { name, page: ctx.short(p.url) } }
          : { key: "form_to_site", params: { name, page: ctx.short(p.url) } };
        receivers.set(name, { name, names: vendor?.names ?? [host.split(".").slice(-2, -1)[0] ?? host], country: vendor?.country, where });
      }
    }
    if (!receivers.size) return unread.length ? info(msg("unread", { count: unread.length })) : skip(msg("no_forms"));

    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;
    const text = policy.js.text;
    const all = [...receivers.values()];
    const missing = all.filter((r) => !r.names.some((n) => ctx.mentions(text, n)));
    if (missing.length) return warn(msg("missing", { names: missing.map((r) => r.name).join(", ") }), capped(missing.map((r) => r.where)));
    const outside = all.filter((r) => r.country && !EEA.has(r.country));
    if (outside.length && !ctx.says("third_country", text)) {
      return info(msg("no_transfer", { names: outside.map((r) => `${r.name} (${r.country})`).join(", ") }), capped(outside.map((r) => r.where)));
    }
    return pass(msg("named", { names: all.map((r) => r.name).join(", ") }));
  },
});

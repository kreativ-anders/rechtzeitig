import { FIXTURES, defineCrossCheck, info, loadYaml, msg, needLegalPage, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

interface Host {
  name: string;
  files: string[];
  contains?: string;
  headers: Record<string, string>;
  country: string;
  names: string[];
}
const HOSTS = loadYaml<Host[]>("data/hosting.yml").map((h) => ({
  ...h,
  fileRes: h.files.map((f) => new RegExp(f)),
  containsRe: h.contains ? new RegExp(h.contains, "im") : undefined,
  headerRes: Object.entries(h.headers).map(([name, value]) => [name.toLowerCase(), new RegExp(value, "i")] as const),
}));
const EEA = new Set(loadYaml<{ eea: string[] }>("data/countries.yml").eea);

export default defineCrossCheck({
  run(ctx, repo) {
    const files = repo.files.filter((f) => !FIXTURES.test(f) && !/(^|\/)node_modules\//.test(f));
    // Repository side: the first deploy file per provider.
    const deployed = HOSTS.flatMap((h) => {
      const file = files.find((f) => h.fileRes.some((re) => re.test(f)) && (!h.containsRe || h.containsRe.test(repo.read(f) ?? "")));
      return file ? [{ host: h, file }] : [];
    });
    if (!deployed.length) return skip(msg("no_config"));

    // Website side: a response header of the start page that only this provider sends.
    const headers = { ...ctx.start.js.headers, ...ctx.start.noJs.headers };
    const confirmed = deployed.flatMap(({ host, file }) => {
      const hit = host.headerRes.find(([name, re]) => headers[name] !== undefined && re.test(headers[name]));
      return hit ? [{ host, file, header: hit[0] }] : [];
    });
    if (!confirmed.length) return skip(msg("unconfirmed", { names: deployed.map((d) => d.host.name).join(", ") }));

    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;
    const text = policy.js.text;
    const where = (c: (typeof confirmed)[number]) => ({ file: c.file, line: 1, params: { name: c.host.name, country: c.host.country, header: c.header } });
    const unnamed = confirmed.filter((c) => !c.host.names.some((n) => ctx.mentions(text, n)));
    if (unnamed.length) {
      const found: Finding[] = unnamed.map((c) => ({ ...where(c), key: "not_named" }));
      return warn(msg("missing", { names: unnamed.map((c) => c.host.name).join(", ") }), found);
    }
    // Named, but outside the EU/EEA and the policy says nothing about third countries.
    const outside = confirmed.filter((c) => !EEA.has(c.host.country));
    if (outside.length && !ctx.says("third_country", text)) {
      return info(msg("no_transfer", { names: outside.map((c) => c.host.name).join(", ") }), outside.map((c) => ({ ...where(c), key: "third_country" })));
    }
    return pass(msg("named", { names: confirmed.map((c) => c.host.name).join(", ") }));
  },
});

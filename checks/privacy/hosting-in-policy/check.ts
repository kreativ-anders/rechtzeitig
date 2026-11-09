import { FIXTURES, HOSTING, defineCrossCheck, hostingHeader, msg, needLegalPage, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

// Providers from data/hosting.yml. Whether a transfer outside the EU/EEA is covered is privacy/third-country's question.
export default defineCrossCheck({
  run(ctx, repo) {
    const files = repo.files.filter((f) => !FIXTURES.test(f) && !/(^|\/)node_modules\//.test(f));
    // Repository side: the first deploy file per provider.
    const deployed = HOSTING.flatMap((h) => {
      const file = files.find((f) => h.fileRes.some((re) => re.test(f)) && (!h.containsRe || h.containsRe.test(repo.read(f) ?? "")));
      return file ? [{ host: h, file }] : [];
    });
    if (!deployed.length) return skip(msg("no_config"));

    // Website side: a response header of the start page that only this provider sends.
    const confirmed = deployed.flatMap(({ host, file }) => {
      const header = hostingHeader(ctx, host);
      return header ? [{ host, file, header }] : [];
    });
    if (!confirmed.length) return skip(msg("unconfirmed", { names: deployed.map((d) => d.host.name).join(", ") }));

    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;
    const text = policy.js.text;
    const unnamed = confirmed.filter((c) => !c.host.names.some((n) => ctx.mentions(text, n)));
    if (unnamed.length) {
      const found: Finding[] = unnamed.map((c) => ({ file: c.file, line: 1, key: "not_named", params: { name: c.host.name, country: c.host.country, header: c.header } }));
      return warn(msg("missing", { names: unnamed.map((c) => c.host.name).join(", ") }), found);
    }
    return pass(msg("named", { names: confirmed.map((c) => c.host.name).join(", ") }));
  },
});

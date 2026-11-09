import { capped, defineCrossCheck, fail, findSecrets, info, msg, ownFiles, pass, redact, siteCode, skip, unique, type Finding } from "../../../src/sdk.ts";

/** An environment variable name, as the public-prefix pattern in data/secrets.yml finds it. */
const ENV_NAME = /^[A-Z][A-Z0-9_]+$/;

export default defineCrossCheck({
  run(ctx, repo) {
    const code = siteCode(ctx);
    if (!code.length) return skip(msg("no_code"));

    // Values that are almost certainly secret (severity fail in data/secrets.yml), in what the site serves.
    const leaks: Finding[] = [];
    for (const file of code) {
      for (const m of findSecrets(file.body).filter((m) => m.severity === "fail")) {
        const where = ctx.short(file.url);
        leaks.push({ key: "secret", params: { name: m.name, where, ...redact(m.value) }, fingerprint: `${m.name}@${new URL(file.url).pathname}` });
      }
    }

    const cut = code.filter((c) => c.truncated).length + ctx.codeSkipped;
    if (!leaks.length) {
      // A pass only when every served file was read to its end.
      if (cut) return info(msg("partly", { count: code.length, cut }));
      return pass(msg("none", { count: code.length }));
    }

    // The likely cause in the repository: a secret read through a public prefix (NEXT_PUBLIC_, VITE_, ...),
    // which the build copies into the browser bundle.
    const names: Finding[] = [];
    for (const file of ownFiles(repo)) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        for (const m of findSecrets(line)) if (ENV_NAME.test(m.value)) names.push({ file, line: i + 1, key: "public_env", params: { env: m.value } });
      });
    }
    const causes = unique(names, (n) => String(n.params?.env));
    const hint: Finding[] = causes.length ? causes : [{ key: "no_public_env" }];
    return fail(msg("leaked", { count: leaks.length }), capped([...leaks, ...hint]));
  },
});

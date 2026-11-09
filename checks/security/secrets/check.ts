import { defineRepoCheck, fail, findSecrets, msg, pass, redact, warn, type Finding } from "../../../src/sdk.ts";

// Generated or test files that often contain key-like strings.
const SKIP = /(^|\/)(fixtures?|__snapshots__)\/|\.lock$|-lock\.(json|yaml)$|\.min\.(js|css)$|\.map$/;

export default defineRepoCheck({
  run(repo) {
    const found: Array<Finding & { severity: "fail" | "warn"; generic: boolean }> = [];
    const lfs = new Set(repo.coverage.lfs);
    const scanned = repo.files.filter((f) => !SKIP.test(f));
    // Binary, too large, or only a Git LFS pointer: not looked at, so the result says how many.
    let unread = 0;
    for (const file of scanned) {
      const text = repo.read(file);
      if (text === undefined || lfs.has(file)) unread++;
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        // Patterns from data/secrets.yml (findSecrets in src/sdk.ts), one find per pattern and line.
        for (const m of findSecrets(line)) found.push({ severity: m.severity, generic: m.generic, file, line: i + 1, key: "secret", params: { name: m.name, ...redact(m.value) } });
      });
    }
    const note: Finding[] = unread ? [{ key: "unread", params: { count: unread } }] : [];
    const details = [...found.map(({ severity, generic, ...f }) => f), ...note];
    if (found.some((f) => f.severity === "fail")) return fail(msg("secrets", { count: found.length }), details);
    // Only generic finds: values that look random under a secret-like name, which may also be hashes or ids.
    if (found.length) return warn(msg(found.some((f) => !f.generic) ? "public_keys" : "possible", { count: found.length }), details);
    return pass(msg("none", { count: scanned.length - unread }), note);
  },
});

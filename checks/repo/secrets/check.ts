import { defineRepoCheck, fail, loadYaml, msg, pass, warn, type Finding } from "../../../src/sdk.ts";

const RULES = loadYaml<Array<{
  name: string;
  pattern: string;
  /** Claims the JWT payload in match group 1 must have. */
  payload?: Record<string, string>;
  severity: "fail" | "warn";
}>>("data/secrets.yml").map((r) => ({ ...r, re: new RegExp(r.pattern, "g") }));
// Generated or test files that often contain key-like strings.
const SKIP = /(^|\/)(fixtures?|__snapshots__)\/|\.lock$|-lock\.(json|yaml)$|\.min\.(js|css)$|\.map$/;

// Enough to find the key again, too little to use it: the first 4 characters and the length.
const redact = (s: string) => ({ start: s.slice(0, 4), length: s.length });

function claims(part: string | undefined, expected: Record<string, string>): boolean {
  try {
    const payload = JSON.parse(Buffer.from(part ?? "", "base64url").toString("utf8"));
    return Object.entries(expected).every(([k, v]) => payload?.[k] === v);
  } catch {
    return false; // not a JWT after all
  }
}

export default defineRepoCheck({
  run(repo) {
    const found: Array<Finding & { severity: "fail" | "warn" }> = [];
    for (const file of repo.files.filter((f) => !SKIP.test(f))) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        for (const rule of RULES) {
          // One find per rule and line; with a payload, the first token whose claims match.
          const m = [...line.matchAll(rule.re)].find((m) => !rule.payload || claims(m[1], rule.payload));
          if (m) found.push({ severity: rule.severity, file, line: i + 1, key: "secret", params: { name: rule.name, ...redact(m[0]) } });
        }
      });
    }
    const details = found.map(({ severity, ...f }) => f);
    if (found.some((f) => f.severity === "fail")) return fail(msg("secrets", { count: found.length }), details);
    if (found.length) return warn(msg("public_keys", { count: found.length }), details);
    return pass(msg("none"));
  },
});

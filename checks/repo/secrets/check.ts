import { defineRepoCheck, fail, loadYaml, pass, warn } from "../../../src/sdk.ts";

const RULES = loadYaml<Array<{
  name: string;
  pattern: string;
  /** Claims the JWT payload in match group 1 must have. */
  payload?: Record<string, string>;
  severity: "fail" | "warn";
}>>("data/secrets.yml").map((r) => ({ ...r, re: new RegExp(r.pattern, "g") }));
// Generated or test files that often contain key-like strings.
const SKIP = /(^|\/)(fixtures?|__snapshots__)\/|\.lock$|-lock\.(json|yaml)$|\.min\.(js|css)$|\.map$/;

// Enough to find the key again, too little to use it.
const redact = (s: string) => `${s.slice(0, 4)}… (${s.length} chars)`;

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
    const found: Array<{ severity: "fail" | "warn"; line: string }> = [];
    for (const file of repo.files.filter((f) => !SKIP.test(f))) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        for (const rule of RULES) {
          // One find per rule and line; with a payload, the first token whose claims match.
          const m = [...line.matchAll(rule.re)].find((m) => !rule.payload || claims(m[1], rule.payload));
          if (m) found.push({ severity: rule.severity, line: `${file}:${i + 1}: ${rule.name} (${redact(m[0])})` });
        }
      });
    }
    const details = found.map((f) => f.line);
    if (found.some((f) => f.severity === "fail")) {
      return fail(`${found.length} secret(s) found. Revoke them, then remove them from the code and the git history.`, details);
    }
    if (found.length) return warn(`${found.length} key(s) found that may be public by design. Check that each is restricted.`, details);
    return pass("No secrets found in tracked files.");
  },
});

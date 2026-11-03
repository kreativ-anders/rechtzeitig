import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { defineRepoCheck, fail, pass, warn } from "../../../src/sdk.ts";

const RULES = (parse(readFileSync(new URL("../../../data/secrets.yml", import.meta.url), "utf8")) as Array<{
  name: string;
  pattern: string;
  severity: "fail" | "warn";
}>).map((r) => ({ ...r, re: new RegExp(r.pattern) }));
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
// Generated or test files that often contain key-like strings.
const SKIP = /(^|\/)(fixtures?|__snapshots__)\/|\.lock$|-lock\.(json|yaml)$|\.min\.(js|css)$|\.map$/;

// Enough to find the key again, too little to use it.
const redact = (s: string) => `${s.slice(0, 4)}… (${s.length} chars)`;

export default defineRepoCheck({
  run(repo) {
    const found: Array<{ severity: "fail" | "warn"; line: string }> = [];
    for (const file of repo.files.filter((f) => !SKIP.test(f))) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        for (const rule of RULES) {
          const m = rule.re.exec(line);
          if (m) found.push({ severity: rule.severity, line: `${file}:${i + 1}: ${rule.name} (${redact(m[0])})` });
        }
        for (const m of line.matchAll(JWT)) {
          try {
            const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
            if (payload.role === "service_role") found.push({ severity: "fail", line: `${file}:${i + 1}: Supabase service_role key (${redact(m[0])})` });
          } catch {
            // not a JWT after all
          }
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

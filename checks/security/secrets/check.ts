import { defineRepoCheck, fail, loadYaml, msg, pass, warn, type Finding } from "../../../src/sdk.ts";

type Level = "token" | "generic";
const DATA = loadYaml<{
  placeholders: string[];
  rules: Array<{
    name: string;
    pattern: string;
    /** Lowercase strings, one of which the line must contain before the pattern runs. */
    keywords?: string[];
    /** Minimum entropy of the `secret` group, from data/thresholds.yml. */
    entropy?: Level;
    /** A `secret` that matches this is a documented example. */
    allow?: string;
    /** Claims the JWT payload in match group 1 must have. */
    payload?: Record<string, string>;
    severity: "fail" | "warn";
  }>;
}>("data/secrets.yml");
const MIN_ENTROPY = loadYaml<Record<string, { entropy: Record<Level, number> }>>("data/thresholds.yml")["security/secrets"].entropy;
const RULES = DATA.rules.map((r) => ({ ...r, re: new RegExp(r.pattern, "g"), allowRe: r.allow ? new RegExp(r.allow) : undefined }));
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

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / s.length) * Math.log2(n / s.length);
  return bits;
}

/** True when a match looks like a real secret, not a placeholder or a documented example. */
function real(rule: (typeof RULES)[number], m: RegExpMatchArray): boolean {
  const secret = m.groups?.secret ?? m[0];
  if (rule.payload && !claims(m[1], rule.payload)) return false;
  if (rule.allowRe?.test(secret)) return false;
  if (!rule.entropy) return true;
  const lower = secret.toLowerCase();
  return entropy(secret) >= MIN_ENTROPY[rule.entropy] && !DATA.placeholders.some((p) => lower.includes(p));
}

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
        const lower = line.toLowerCase();
        let named = false;
        for (const rule of RULES) {
          if (rule.keywords && !rule.keywords.some((k) => lower.includes(k))) continue;
          // The generic assignment rule only speaks when no named rule found something on the line.
          if (rule.entropy === "generic" && named) continue;
          // One find per rule and line: the first match that passes the filters.
          const m = [...line.matchAll(rule.re)].find((m) => real(rule, m));
          if (!m) continue;
          named = true;
          found.push({ severity: rule.severity, generic: rule.entropy === "generic", file, line: i + 1, key: "secret", params: { name: rule.name, ...redact(m.groups?.secret ?? m[0]) } });
        }
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

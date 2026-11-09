import { FIXTURES, capped, defineRepoCheck, fail, findSecrets, lineAt, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const AGENT = loadYaml<{
  instructions: string[];
  config: string[];
  secret_key: string;
  not_secret_key: string;
  placeholder: string;
  secret_flag: string;
}>("data/agent-files.yml");
const LIMITS = loadYaml<{ "security/agent-config-secrets": { min_length: number; min_entropy: number } }>("data/thresholds.yml")[
  "security/agent-config-secrets"
];

const AGENT_FILES = [...AGENT.instructions, ...AGENT.config].map((p) => new RegExp(p));
const SECRET_KEY = new RegExp(AGENT.secret_key, "i");
const NOT_SECRET_KEY = new RegExp(AGENT.not_secret_key, "i");
const PLACEHOLDER = new RegExp(AGENT.placeholder, "i");
// "KEY": "value", KEY = "value", KEY: value, KEY=value (JSON, YAML, TOML, .env lines in Markdown).
const PAIR = /["']?([A-Za-z_][\w.-]*)["']?\s*(?::|=)\s*["']?([^"'\s,;}]+(?: [^"'\s,;}]+)?)["']?/g;
const FLAG = new RegExp(`["']?${AGENT.secret_flag}["']?(?:\\s*=\\s*|["']?\\s*,\\s*["']|\\s+)["']?([^"'\\s,\\]]+)`, "gi");

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.values()].reduce((sum, n) => sum - (n / s.length) * Math.log2(n / s.length), 0);
}

/** A value that looks like a real credential, not a reference, placeholder, path or URL. */
function literal(value: string): boolean {
  const v = value.replace(/^(Bearer|Basic|token)\s+/i, "");
  if (/\s/.test(v) || v.length < LIMITS.min_length || PLACEHOLDER.test(v)) return false;
  if (/^[a-z][\w+.-]*:\/\//i.test(v) || /^(\.{0,2}\/|~)/.test(v)) return false;
  return /\d/.test(v) && /[A-Za-z]/.test(v) && entropy(v) >= LIMITS.min_entropy;
}

/** camelCase keys split with "_", so apiKey and accessToken match like api_key and access_token. */
const words = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");

export default defineRepoCheck({
  run(repo) {
    const files = repo.files.filter((f) => !FIXTURES.test(f) && AGENT_FILES.some((re) => re.test(f)));
    if (!files.length) return skip(msg("no_files"));
    const failed: Finding[] = [];
    const warned: Finding[] = [];
    for (const file of files) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        const at = { file, line: i + 1 };
        // Known key formats first; the value is never shown, only its kind and length.
        // Named patterns of data/secrets.yml (findSecrets in src/sdk.ts, with its placeholder and entropy filters);
        // the generic assignment rule is left out, the credential keys below cover that here.
        const m = findSecrets(line).find((m) => !m.generic && !PLACEHOLDER.test(m.value));
        if (m) {
          (m.severity === "fail" ? failed : warned).push({ ...at, key: "secret", params: { name: m.name, length: m.value.length } });
          return;
        }
        for (const m of line.matchAll(PAIR)) {
          const key = words(m[1]);
          if (SECRET_KEY.test(key) && !NOT_SECRET_KEY.test(key) && literal(m[2])) {
            failed.push({ ...at, key: "literal", params: { name: m[1], length: m[2].length } });
            return;
          }
        }
      });
      // Flags with their value, also as separate array items on the next line (["--api-key", "value"]).
      const flagged = new Set(failed.filter((f) => f.file === file).map((f) => f.line));
      for (const m of text.matchAll(FLAG)) {
        const line = lineAt(text, (m.index ?? 0) + m[0].length);
        const value = m[m.length - 1];
        if (literal(value) && !flagged.has(line)) failed.push({ file, line, key: "flag", params: { length: value.length } });
      }
    }
    if (failed.length) return fail(msg("found", { count: failed.length + warned.length }), capped([...failed, ...warned]));
    if (warned.length) return warn(msg("public_keys", { count: warned.length }), capped(warned));
    return pass(msg("none", { count: files.length }));
  },
});

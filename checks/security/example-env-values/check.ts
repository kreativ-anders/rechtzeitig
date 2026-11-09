import { FIXTURES, capped, defineRepoCheck, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const DATA = loadYaml<Record<string, Record<string, string>>>("data/insecure-code.yml")["security/example-env-values"];
const LIMITS = loadYaml<Record<string, { min_length: number; min_entropy: number }>>("data/thresholds.yml")["security/example-env-values"];
const TEMPLATE = new RegExp(DATA.templates, "i");
const SECRET = new RegExp(DATA.secret_names, "i");
const PUBLIC = new RegExp(DATA.public_names, "i");
const PLACEHOLDER = new RegExp(DATA.placeholders, "i");
const URL_PASSWORD = new RegExp(DATA.url_password, "i");
const LOCAL = new RegExp(DATA.local_hosts, "i");
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.values()].reduce((sum, n) => sum - (n / s.length) * Math.log2(n / s.length), 0);
}

/** The value without quotes and without a comment after it. */
function value(raw: string): string {
  const quoted = /^(["'])(.*)\1/.exec(raw);
  return quoted ? quoted[2] : raw.replace(/\s+#.*$/, "");
}

/** Why a value looks real, or undefined for an empty value or a placeholder. Never returns the value. */
function looksReal(name: string, v: string): "url_password" | "real_value" | undefined {
  const url = URL_PASSWORD.exec(v);
  if (url?.groups) {
    const { password, host } = url.groups;
    return !PLACEHOLDER.test(password) && !LOCAL.test(host) && !PLACEHOLDER.test(host) ? "url_password" : undefined;
  }
  if (!SECRET.test(name) || PUBLIC.test(name)) return undefined;
  if (v.length < LIMITS.min_length || PLACEHOLDER.test(v) || !/[a-z]/i.test(v) || !/\d/.test(v)) return undefined;
  return entropy(v) >= LIMITS.min_entropy ? "real_value" : undefined;
}

export default defineRepoCheck({
  run(repo) {
    const templates = repo.files.filter((f) => TEMPLATE.test(f) && !FIXTURES.test(f));
    if (!templates.length) return skip(msg("no_template"));
    const found: Finding[] = [];
    for (const file of templates) {
      (repo.read(file) ?? "").split("\n").forEach((line, i) => {
        const m = LINE.exec(line);
        if (!m) return;
        const key = looksReal(m[1], value(m[2]));
        if (key) found.push({ file, line: i + 1, key, params: { name: m[1] } });
      });
    }
    if (found.length) return warn(msg("suspect", { count: found.length }), capped(found));
    return pass(msg("none", { count: templates.length }));
  },
});

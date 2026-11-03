import { defineRepoCheck, fail, pass, skip, warn } from "../../../src/sdk.ts";

const CREATE = /create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?"?(\w+)"?/gi;
const ENABLE = /alter\s+table\s+(only\s+)?(public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi;
const OPEN_POLICY = /create\s+policy[\s\S]{0,300}?using\s*\(\s*true\s*\)/gi;
const OPEN_RULE = /allow\s+[\w\s,]+:\s*if\s+true\s*;/;
const OPEN_RTDB = /"\.(read|write)"\s*:\s*true/;

export default defineRepoCheck({
  run(repo) {
    const sql = repo.files.filter((f) => /(^|\/)supabase\/.*\.sql$/.test(f));
    const rules = repo.files.filter((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$/.test(f));
    if (!sql.length && !rules.length) return skip("No Supabase migrations or Firebase rules in the repository.");

    const all = sql.map((f) => repo.read(f) ?? "").join("\n");
    const created = new Set([...all.matchAll(CREATE)].map((m) => m[3].toLowerCase()));
    const secured = new Set([...all.matchAll(ENABLE)].map((m) => m[3].toLowerCase()));
    const problems = [...created].filter((t) => !secured.has(t)).map((t) => `Supabase table "${t}" has no row level security.`);
    for (const f of rules) {
      const text = repo.read(f) ?? "";
      if (OPEN_RULE.test(text) || OPEN_RTDB.test(text)) problems.push(`${f} allows access for everyone ("if true").`);
    }
    const open = [...all.matchAll(OPEN_POLICY)].length;
    if (problems.length) return fail("Data can be read or changed by anyone with the public key.", problems);
    if (open) return warn(`${open} Supabase policy(ies) use "using (true)". Check that this data is meant to be public.`);
    return pass(`${created.size} Supabase table(s) with row level security${rules.length ? `, ${rules.length} Firebase rule file(s) without open access` : ""}.`);
  },
});

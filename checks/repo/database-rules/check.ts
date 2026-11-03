import { defineRepoCheck, fail, pass, skip, warn } from "../../../src/sdk.ts";

// Each runs on one SQL statement, anchored at its start, so no pattern spans two statements.
const NAME = String.raw`(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?`; // optional schema, table
const CREATE = new RegExp(String.raw`^\s*create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`, "i");
const ENABLE = new RegExp(String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+enable\s+row\s+level\s+security\b`, "i");
const POLICY = /^\s*create\s+policy\b/i;
const ALLOW_ALL = /\b(using|with\s+check)\s*\(\s*true\s*\)/i;
const OPEN_RULE = /\ballow\b[\w, \t]{1,200}:\s*if\s+true\s*;/;
// Firebase "test mode": open to everyone until a date.
const TEST_MODE = /\ballow\b[\w, \t]{1,200}:\s*if\s+request\.time\s*<\s*timestamp\.date\s*\(/;
const OPEN_RTDB = /"\.(read|write)"\s*:\s*true/;

/** SQL statements without line comments. Function bodies with ";" split too; their parts match nothing. */
const statements = (sql: string) => sql.replace(/--[^\n]*/g, "").split(";");

/** "schema.table" in lower case; tables without a schema are in public. */
const table = (m: RegExpExecArray) => `${(m[1] ?? "public").toLowerCase()}.${m[2].toLowerCase()}`;

export default defineRepoCheck({
  run(repo) {
    const sql = repo.files.filter((f) => /(^|\/)supabase\/.*\.sql$/.test(f));
    const rules = repo.files.filter((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$/.test(f));
    if (!sql.length && !rules.length) return skip("No Supabase migrations or Firebase rules in the repository.");

    const created = new Set<string>();
    const secured = new Set<string>();
    let open = 0;
    for (const statement of sql.flatMap((f) => statements(repo.read(f) ?? ""))) {
      const create = CREATE.exec(statement);
      const enable = ENABLE.exec(statement);
      // Only the public schema is exposed through the Supabase API by default.
      if (create && table(create).startsWith("public.")) created.add(table(create));
      if (enable) secured.add(table(enable));
      if (POLICY.test(statement) && ALLOW_ALL.test(statement)) open++;
    }
    const problems = [...created].filter((t) => !secured.has(t)).map((t) => `Supabase table "${t.slice("public.".length)}" has no row level security.`);
    for (const f of rules) {
      const text = repo.read(f) ?? "";
      if (OPEN_RULE.test(text) || OPEN_RTDB.test(text)) problems.push(`${f} allows access for everyone ("if true").`);
      else if (TEST_MODE.test(text)) problems.push(`${f} is in test mode: everyone has access until the date in "request.time < timestamp.date(...)".`);
    }
    if (problems.length) return fail("Data can be read or changed by anyone with the public key.", problems);
    if (open) return warn(`${open} Supabase policy(ies) use "using (true)" or "with check (true)". Check that this data is meant to be public.`);
    return pass(`${created.size} Supabase table(s) with row level security${rules.length ? `, ${rules.length} Firebase rule file(s) without open access` : ""}.`);
  },
});

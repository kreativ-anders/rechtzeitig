import { defineRepoCheck, fail, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

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

/**
 * SQL statements without line comments, each with the line it starts on (after leading blank space).
 * Function bodies with ";" split too; their parts match nothing.
 */
function statements(sql: string): Array<{ text: string; line: number }> {
  let line = 1; // removing comments keeps the line breaks
  return sql.replace(/--[^\n]*/g, "").split(";").map((text) => {
    const start = line + (text.match(/^\s*/)![0].match(/\n/g)?.length ?? 0);
    line += text.match(/\n/g)?.length ?? 0;
    return { text, line: start };
  });
}

/** 1-based line of a position in a text. */
const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** "schema.table" in lower case; tables without a schema are in public. */
const table = (m: RegExpExecArray) => `${(m[1] ?? "public").toLowerCase()}.${m[2].toLowerCase()}`;

export default defineRepoCheck({
  run(repo) {
    const sql = repo.files.filter((f) => /(^|\/)supabase\/.*\.sql$/.test(f));
    const rules = repo.files.filter((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$/.test(f));
    if (!sql.length && !rules.length) return skip(msg("nothing"));

    // Table → where it is created first.
    const created = new Map<string, { file: string; line: number }>();
    const secured = new Set<string>();
    let open = 0;
    for (const { file, text: statement, line } of sql.flatMap((file) => statements(repo.read(file) ?? "").map((s) => ({ file, ...s })))) {
      const create = CREATE.exec(statement);
      const enable = ENABLE.exec(statement);
      // Only the public schema is exposed through the Supabase API by default.
      if (create && table(create).startsWith("public.") && !created.has(table(create))) created.set(table(create), { file, line });
      if (enable) secured.add(table(enable));
      if (POLICY.test(statement) && ALLOW_ALL.test(statement)) open++;
    }
    const problems: Finding[] = [...created]
      .filter(([t]) => !secured.has(t))
      .map(([t, where]) => ({ ...where, key: "no_rls", params: { table: t.slice("public.".length) } }));
    for (const file of rules) {
      const text = repo.read(file) ?? "";
      const openMatch = OPEN_RULE.exec(text) ?? OPEN_RTDB.exec(text);
      const testMatch = openMatch ? null : TEST_MODE.exec(text);
      if (openMatch) problems.push({ file, line: lineAt(text, openMatch.index), key: "open_rules" });
      else if (testMatch) problems.push({ file, line: lineAt(text, testMatch.index), key: "test_mode" });
    }
    if (problems.length) return fail(msg("open_data"), problems);
    if (open) return warn(msg("open_policies", { count: open }));
    return pass(msg("secured", { count: created.size, rules: rules.length ? msg("rule_files", { count: rules.length }) : "" }));
  },
});

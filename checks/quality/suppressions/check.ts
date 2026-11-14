import { defineRepoCheck, fail, loadSuppressions, msg, pass, SUPPRESSIONS_FILE } from "../../../src/sdk.ts";

// The file is parsed and validated in src/suppress.ts, which src/main.ts also uses to apply it, so what this rule
// reports and what the scan turns off cannot differ.
export default defineRepoCheck({
  run(repo) {
    const file = SUPPRESSIONS_FILE;
    const s = loadSuppressions(repo.root);
    if (!s) return pass(msg("no_file", { file }));
    if (s.problems.length) {
      return fail(msg("invalid", { count: s.problems.length, file }), s.problems.map((p) => ({ file, ...(p.line && { line: p.line }), key: p.key, params: p.params })));
    }
    const entries = s.entries.map((e) => ({
      file, line: e.line, key: e.expires ? "entry_until" : "entry", params: { rule: e.rule, category: e.category, ...(e.expires && { date: e.expires }) },
    }));
    return pass(msg("valid", { count: s.entries.length, file }), entries);
  },
});

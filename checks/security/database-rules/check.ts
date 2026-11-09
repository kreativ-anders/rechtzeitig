import { databaseRules, defineRepoCheck, fail, msg, pass, skip, warn } from "../../../src/sdk.ts";

export default defineRepoCheck({
  run(repo) {
    // Supabase migrations and Firebase rules, read by databaseRules() in src/sdk.ts (shared with security/database-live).
    const db = databaseRules(repo);
    if (!db.sql.length && !db.rules.length) return skip(msg("nothing"));
    if (db.problems.length) return fail(msg("open_data"), db.problems);
    if (db.openPolicies) return warn(msg("open_policies", { count: db.openPolicies }));
    return pass(msg("secured", { count: db.tables, rules: db.rules.length ? msg("rule_files", { count: db.rules.length }) : "" }));
  },
});

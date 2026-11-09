import { databaseRules, defineCrossCheck, fail, hostsIn, info, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const SERVICES = loadYaml<{ supabase: string[]; firebase: string[] }>("data/databases.yml");
/** Which problems of databaseRules() belong to which service. */
const KEYS = { supabase: ["no_rls"], firebase: ["open_rules", "test_mode"] };
const NAMES = { supabase: "Supabase", firebase: "Firebase" };

export default defineCrossCheck({
  run(ctx, repo) {
    // Requests of the site's pages and URLs in its served code, for example https://<project>.supabase.co in the bundle.
    const used = (["supabase", "firebase"] as const)
      .map((service) => ({ service, hosts: hostsIn(ctx, SERVICES[service]) }))
      .filter((u) => u.hosts.length);
    if (!used.length) return skip(msg("not_used"));

    const db = databaseRules(repo);
    const hosts = used.flatMap((u) => u.hosts).join(", ");
    const problems = db.problems.filter((p) => used.some((u) => KEYS[u.service].includes(p.key ?? "")));
    if (problems.length) return fail(msg("open_live", { hosts }), problems);

    // The site uses the service, but the repository holds no rules for it: they live in the dashboard, unchecked.
    const files = { supabase: db.sql, firebase: db.rules };
    const elsewhere: Finding[] = used.filter((u) => !files[u.service].length).map((u) => ({ key: "no_rules", params: { service: NAMES[u.service], hosts: u.hosts.join(", ") } }));
    const unread: Finding[] = db.unread.map((file) => ({ file, key: "unread" }));
    if (elsewhere.length || unread.length) return info(msg("unchecked", { hosts }), [...elsewhere, ...unread]);
    if (used.some((u) => u.service === "supabase") && db.openPolicies) return warn(msg("open_policies", { count: db.openPolicies, hosts }));
    return pass(msg("secured", { hosts }));
  },
});

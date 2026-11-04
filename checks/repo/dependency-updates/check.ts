import { WORKFLOWS, defineRepoCheck, info, loadYaml, msg, pass, skip, warn, type Ecosystem } from "../../../src/sdk.ts";

const TOOLS = loadYaml<{ dependabot: Record<Ecosystem, string[]>; renovate: string; scanners: string[] }>("data/update-tools.yml");
const DEPENDABOT = TOOLS.dependabot;
const RENOVATE = new RegExp(TOOLS.renovate);
const SCANNERS = TOOLS.scanners.map((s) => s.toLowerCase());

export default defineRepoCheck({
  run(repo) {
    const used = [...new Set(repo.components.map((c) => c.ecosystem))];
    if (!used.length) return skip(msg("no_components"));

    const dependabotFile = repo.find(/^\.github\/dependabot\.ya?ml$/)[0];
    const updates = (dependabotFile && repo.yaml<{ updates?: Array<{ "package-ecosystem"?: string }> }>(dependabotFile)?.updates) || [];
    const covered = new Set(Array.isArray(updates) ? updates.map((u) => u?.["package-ecosystem"]) : []);
    const renovate = repo.find(RENOVATE).length > 0 || repo.yaml<{ renovate?: unknown }>("package.json")?.renovate !== undefined;
    const scanners = [
      ...repo.find(/^\.snyk$/),
      ...repo.find(WORKFLOWS).filter((f) => {
        const text = (repo.read(f) ?? "").toLowerCase();
        return SCANNERS.some((s) => text.includes(s));
      }),
    ];

    if (renovate) return pass(msg("renovate"));
    const missing = used.filter((e) => !DEPENDABOT[e].some((name) => covered.has(name)));
    if (dependabotFile && !missing.length) return pass(msg("dependabot", { ecosystems: used.join(", ") }));
    if (dependabotFile) {
      const details = missing.map((e) => ({ file: dependabotFile, key: "add_ecosystem", params: { name: DEPENDABOT[e][0] } }));
      return warn(msg("dependabot_missing", { ecosystems: missing.join(", ") }), details);
    }
    if (scanners.length) return info(msg("scan_only"), scanners.map((file) => ({ file })));
    const entries = used.map((e) => `package-ecosystem "${DEPENDABOT[e][0]}"`).join(", ");
    return warn(msg("unwatched"), [{ key: "add_dependabot", params: { entries } }]);
  },
});

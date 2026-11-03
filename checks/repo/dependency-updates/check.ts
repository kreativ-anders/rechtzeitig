import { WORKFLOWS, defineRepoCheck, info, loadYaml, pass, skip, warn, type Ecosystem } from "../../../src/sdk.ts";

const TOOLS = loadYaml<{ dependabot: Record<Ecosystem, string[]>; renovate: string; scanners: string[] }>("data/update-tools.yml");
const DEPENDABOT = TOOLS.dependabot;
const RENOVATE = new RegExp(TOOLS.renovate);
const SCANNERS = TOOLS.scanners.map((s) => s.toLowerCase());

export default defineRepoCheck({
  run(repo) {
    const used = [...new Set(repo.components.map((c) => c.ecosystem))];
    if (!used.length) return skip("No locked dependencies.");

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

    if (renovate) return pass("Renovate keeps dependencies up to date.");
    const missing = used.filter((e) => !DEPENDABOT[e].some((name) => covered.has(name)));
    if (dependabotFile && !missing.length) return pass(`Dependabot covers ${used.join(", ")}.`);
    if (dependabotFile) return warn(`Dependabot does not cover ${missing.join(", ")}.`, missing.map((e) => `Add package-ecosystem "${DEPENDABOT[e][0]}" to ${dependabotFile}.`));
    if (scanners.length) return info("Vulnerabilities are scanned, but no tool opens update pull requests.", scanners);
    return warn("Nothing watches the dependencies for new vulnerabilities. Add Dependabot or Renovate.", [
      `Add .github/dependabot.yml with one entry per ecosystem: ${used.map((e) => `package-ecosystem "${DEPENDABOT[e][0]}"`).join(", ")}.`,
    ]);
  },
});

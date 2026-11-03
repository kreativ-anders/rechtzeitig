import { parse } from "yaml";
import { defineRepoCheck, info, pass, skip, warn, type Ecosystem } from "../../../src/sdk.ts";

// rechtzeitig ecosystem → names Dependabot uses for it.
const DEPENDABOT: Record<Ecosystem, string[]> = {
  npm: ["npm", "bun"],
  composer: ["composer"],
  pub: ["pub"],
  cargo: ["cargo"],
  pypi: ["pip", "uv", "pipenv", "poetry"],
  go: ["gomod"],
};
const RENOVATE = /^(\.github\/|\.gitlab\/)?(renovate\.json5?|\.renovaterc(\.json5?)?)$/;
// Tools that report vulnerabilities without opening update pull requests.
const SCANNERS = /snyk\/actions|osv-scanner|aquasecurity\/trivy|anchore\/scan-action|grype|socketdev|npm audit|pnpm audit|yarn (npm )?audit|composer audit|pip-audit|cargo audit|govulncheck|dependency-review-action/i;

export default defineRepoCheck({
  run(repo) {
    const used = [...new Set(repo.components.map((c) => c.ecosystem))];
    if (!used.length) return skip("No locked dependencies.");

    const dependabotFile = repo.files.find((f) => /^\.github\/dependabot\.ya?ml$/.test(f));
    const covered = new Set<string>(
      (parse(dependabotFile ? (repo.read(dependabotFile) ?? "") : "")?.updates ?? []).map((u: { "package-ecosystem"?: string }) => u["package-ecosystem"]),
    );
    const renovate = repo.files.some((f) => RENOVATE.test(f)) || /"renovate"\s*:/.test(repo.read("package.json") ?? "");
    const scanners = repo.files
      .filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f) || f === ".snyk")
      .filter((f) => f === ".snyk" || SCANNERS.test(repo.read(f) ?? ""));

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

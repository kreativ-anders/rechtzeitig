import { defineRepoCheck, info, loadYaml, msg, pass, warn, type Component, type Finding } from "../../../src/sdk.ts";

const groups = loadYaml<Record<"agpl" | "gpl" | "restricted" | "permissive", string[]>>("data/licenses.yml");
const group = (name: keyof typeof groups) => new RegExp(groups[name].join("|"), "i");
const AGPL = group("agpl");
const GPL = group("gpl");
const RESTRICTED = group("restricted");
const PERMISSIVE = group("permissive");

/** true when every alternative of an SPDX "A OR B" expression matches, so no choice avoids the license. */
const only = (re: RegExp, license: string) => license.split(/\s+OR\s+/i).every((option) => re.test(option));

function projectIssues(project: string): Finding[] {
  if (GPL.test(project) && /Commons-Clause/i.test(project)) return [{ key: "commons_clause", params: { project } }];
  return [];
}

function dependencyIssues(components: Component[], project: string): Finding[] {
  return components.flatMap((c): Finding[] => {
    const license = c.license!;
    const finding = (key: string, extra = {}) => [{ file: c.source, key, params: { name: c.name, version: c.version, license, ...extra } }];
    if (RESTRICTED.test(license)) return finding("restricted");
    if (only(AGPL, license) && !AGPL.test(project)) return finding("agpl");
    if (only(GPL, license) && !GPL.test(project)) return finding("gpl", { not: project ? msg("not_project", { project }) : "" });
    return [];
  });
}

export default defineRepoCheck({
  run(repo) {
    const project = repo.license;
    const production = repo.components.filter((c) => !c.dev);
    const issues = [...projectIssues(project), ...dependencyIssues(production.filter((c) => c.license), project)];
    const unknown = production.filter((c) => !c.license && (c.ecosystem === "npm" || c.ecosystem === "composer"));
    const names = `${unknown.slice(0, 10).map((c) => c.name).join(", ")}${unknown.length > 10 ? ", ..." : ""}`;
    const notes: Finding[] = [
      ...(project ? [] : [{ key: "no_project_license" }]),
      ...(unknown.length ? [{ key: "unknown", params: { count: unknown.length, names } }] : []),
    ];
    if (issues.length) return warn(msg("questions", { count: issues.length }), [...issues, ...notes]);
    if (!project || unknown.length) return info(msg("unknown_licenses", { with: project ? msg("with_project", { project }) : "" }), notes);
    const counted = repo.components.filter((c) => c.license).length;
    return pass(msg("no_conflicts", { project, counted: counted ? msg("counted", { count: counted }) : "" }), PERMISSIVE.test(project) ? [] : notes);
  },
});

import { defineRepoCheck, info, loadYaml, pass, warn, type Component } from "../../../src/sdk.ts";

const groups = loadYaml<Record<"agpl" | "gpl" | "restricted" | "permissive", string[]>>("data/licenses.yml");
const group = (name: keyof typeof groups) => new RegExp(groups[name].join("|"), "i");
const AGPL = group("agpl");
const GPL = group("gpl");
const RESTRICTED = group("restricted");
const PERMISSIVE = group("permissive");

/** true when every alternative of an SPDX "A OR B" expression matches, so no choice avoids the license. */
const only = (re: RegExp, license: string) => license.split(/\s+OR\s+/i).every((option) => re.test(option));

function projectIssues(project: string): string[] {
  if (GPL.test(project) && /Commons-Clause/i.test(project)) {
    return [`Project: ${project}. GPL-3.0 § 7 lets recipients remove "further restrictions", so the Commons Clause may not hold.`];
  }
  return [];
}

function dependencyIssues(components: Component[], project: string): string[] {
  return components.flatMap((c) => {
    const license = c.license!;
    const id = `${c.name}@${c.version}: ${license}`;
    if (RESTRICTED.test(license)) return [`${id}. Restricts use, often commercial use.`];
    if (only(AGPL, license) && !AGPL.test(project)) return [`${id}. AGPL also applies when you only offer the software over a network.`];
    if (only(GPL, license) && !GPL.test(project)) {
      return [`${id}. If you ship it (app, library, browser bundle), the whole work must be under the GPL${project ? `, not ${project}` : ""}.`];
    }
    return [];
  });
}

export default defineRepoCheck({
  run(repo) {
    const project = repo.license;
    const production = repo.components.filter((c) => !c.dev);
    const issues = [...projectIssues(project), ...dependencyIssues(production.filter((c) => c.license), project)];
    const unknown = production.filter((c) => !c.license && (c.ecosystem === "npm" || c.ecosystem === "composer"));
    const notes = [
      ...(project ? [] : ["The project has no license: all rights reserved. Fine for private code."]),
      ...(unknown.length ? [`${unknown.length} production dependencies without a license in the lockfile: ${unknown.slice(0, 10).map((c) => c.name).join(", ")}${unknown.length > 10 ? ", ..." : ""}`] : []),
    ];
    if (issues.length) return warn(`${issues.length} license question(s) to clear.`, [...issues, ...notes]);
    if (!project || unknown.length) return info(`No conflicts found${project ? ` with ${project}` : ""}, but some licenses are unknown.`, notes);
    const counted = repo.components.filter((c) => c.license).length;
    return pass(`No conflicts with ${project}${counted ? ` in ${counted} licensed components` : ""}.`, PERMISSIVE.test(project) ? [] : notes);
  },
});

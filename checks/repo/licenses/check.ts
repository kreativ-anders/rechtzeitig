import { defineRepoCheck, info, pass, warn } from "../../../src/sdk.ts";

const AGPL = /\bAGPL/i;
const GPL = /(^|[^L])GPL/i;
const RESTRICTED = /SSPL|BUSL|BSL-1|Commons.?Clause|CC-BY-NC|Elastic-2|proprietary/i;
const PERMISSIVE = /^(MIT|ISC|BSD|Apache|0BSD|Unlicense|Zlib|MPL)/i;

export default defineRepoCheck({
  run(repo) {
    const project = repo.license;
    const issues: string[] = [];
    if (GPL.test(project) && /Commons-Clause/i.test(project)) {
      issues.push(`Project: ${project}. GPL-3.0 § 7 lets recipients remove "further restrictions", so the Commons Clause may not hold.`);
    }
    for (const c of repo.components.filter((c) => !c.dev && c.license)) {
      const id = `${c.name}@${c.version}: ${c.license}`;
      if (RESTRICTED.test(c.license!)) issues.push(`${id}. Restricts use, often commercial use.`);
      else if (AGPL.test(c.license!) && !AGPL.test(project)) issues.push(`${id}. AGPL also applies when you only offer the software over a network.`);
      else if (GPL.test(c.license!) && !/OR/i.test(c.license!) && !GPL.test(project)) {
        issues.push(`${id}. If you ship it (app, library, browser bundle), the whole work must be under the GPL${project ? `, not ${project}` : ""}.`);
      }
    }
    const unknown = repo.components.filter((c) => !c.dev && !c.license && (c.ecosystem === "npm" || c.ecosystem === "composer"));
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

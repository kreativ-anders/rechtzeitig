import { defineRepoCheck, fail, pass, skip, warn } from "../../../src/sdk.ts";

const SERIOUS = new Set(["CRITICAL", "HIGH"]);

export default defineRepoCheck({
  run(repo) {
    if (!repo.components.length) return skip("No locked dependencies to check.");
    if (repo.osv === "skipped") return skip("Vulnerability lookup was turned off.");
    if (repo.osv !== "ok") return warn(`Could not query OSV: ${repo.osv}`);
    if (!repo.vulnerabilities.length) return pass(`No known vulnerabilities in ${repo.components.length} components.`);

    const component = (purl: string) => repo.components.find((c) => c.purl === purl);
    const details = repo.vulnerabilities.map((v) => {
      const c = component(v.purl);
      return `${c?.name}@${c?.version}${c?.dev ? " (dev)" : ""}: ${v.id}${v.severity ? ` ${v.severity}` : ""}. ${v.summary}${v.fixed ? ` Fixed in ${v.fixed}.` : ""}`;
    });
    const serious = repo.vulnerabilities.filter((v) => SERIOUS.has(v.severity) && !component(v.purl)?.dev);
    const message = `${repo.vulnerabilities.length} known vulnerabilit${repo.vulnerabilities.length === 1 ? "y" : "ies"}, ${serious.length} high or critical in production dependencies.`;
    return serious.length ? fail(message, details) : warn(message, details);
  },
});

import { defineRepoCheck, fail, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const SERIOUS = new Set(["CRITICAL", "HIGH"]);

export default defineRepoCheck({
  run(repo) {
    if (!repo.components.length) return skip(msg("no_components"));
    if (!repo.osv.startsWith("ok")) return warn(msg("osv_error", { error: repo.osv }));
    if (!repo.vulnerabilities.length) return pass(msg("none", { count: repo.components.length }));

    // The same package can be locked in several lockfiles: one finding per lockfile, production first.
    const components = (purl: string) => {
      const bySource = [...new Map(repo.components.filter((c) => c.purl === purl).map((c) => [c.source, c])).values()];
      return bySource.sort((a, b) => Number(a.dev) - Number(b.dev) || a.source.localeCompare(b.source));
    };
    const finding = (v: (typeof repo.vulnerabilities)[number], c?: (typeof repo.components)[number]): Finding => ({
      file: c?.source,
      key: "issue",
      params: {
        name: String(c?.name),
        version: String(c?.version),
        dev: c?.dev ? msg("dev") : "",
        id: v.id,
        severity: v.severity ? ` ${v.severity}` : "",
        summary: v.summary ? ` ${v.summary}` : "",
        fixed: v.fixed ? msg("fixed", { version: v.fixed }) : "",
      },
      // OSV can add a fixed version or change the summary; the alert stays the same per lockfile.
      fingerprint: `${v.purl} ${v.id} ${c?.source ?? ""}`,
    });
    const details = repo.vulnerabilities.flatMap((v) => {
      const cs = components(v.purl);
      return (cs.length ? cs : [undefined]).map((c) => finding(v, c));
    });
    // Counts as production when any lockfile uses the package there.
    const serious = repo.vulnerabilities.filter((v) => SERIOUS.has(v.severity) && components(v.purl).some((c) => !c.dev));
    // "ok (details for N of M)": OSV sent details for only some issues.
    const [, got, total] = repo.osv.match(/(\d+) of (\d+)/) ?? [];
    const partial = repo.osv === "ok" ? "" : msg("partial", { got: Number(got), count: Number(total) });
    const message = msg("found", { count: repo.vulnerabilities.length, serious: serious.length, partial });
    return serious.length ? fail(message, details) : warn(message, details);
  },
});

import { capped, defineRepoCheck, dependencyLicenses, info, msg, offending, pass, skip, unavoidable, warn, type Classified, type Finding } from "../../../src/sdk.ts";

const unclear = (t: Classified) => t.category === "unknown";

export default defineRepoCheck({
  run(repo) {
    const deps = dependencyLicenses(repo);
    const unclearIds: Finding[] = [];
    const missing: Finding[] = deps.checked.flatMap(({ component: c, license }): Finding[] => {
      const at = { file: c.source, params: { name: c.name, version: c.version, license: license.raw } };
      if (license.status !== "ok") return [{ ...at, key: `status_${license.status}` }];
      if (!unavoidable(license, unclear)) return [];
      const term = offending(license, unclear)!;
      // A custom license (LicenseRef-) has a text somewhere; a non-SPDX name such as "BSD" or "Apache 2.0" is only unclear.
      if (/LicenseRef-/i.test(term.id)) return [{ ...at, key: "custom" }];
      unclearIds.push({ ...at, key: "not_spdx" });
      return [];
    });

    // What could not be checked at all: never a pass (RepoContext.coverage).
    const bySource = Object.entries(Object.groupBy(deps.unchecked, (c) => c.source));
    const gaps: Finding[] = [
      ...bySource.map(([file, list]) => ({ file, key: "no_data", params: { count: list!.length, ecosystem: list![0].ecosystem } })),
      ...repo.coverage.lockfiles.failed.map(({ file }) => ({ file, key: "unreadable" })),
      ...repo.coverage.unsupported.map(({ file, ecosystem }) => ({ file, key: "unsupported", params: { ecosystem } })),
    ];
    const production = repo.components.filter((c) => !c.dev).length;
    if (!production && !gaps.length) return skip(msg("no_components"));
    if (!deps.checked.length) return skip(msg("none_checked", { count: production }), capped(gaps));
    if (missing.length) return warn(msg("found", { count: missing.length }), [...capped([...missing, ...unclearIds]), ...capped(gaps)]);
    if (unclearIds.length) return info(msg("unclear", { count: unclearIds.length }), [...capped(unclearIds), ...capped(gaps)]);
    if (gaps.length) return info(msg("gaps", { count: deps.checked.length, gaps: gaps.length }), capped(gaps));
    return pass(msg("none", { count: deps.checked.length }));
  },
});

import { MANIFESTS, defineRepoCheck, info, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

export default defineRepoCheck({
  run(repo) {
    const files = new Set(repo.files);
    const { lockfiles, unsupported } = repo.coverage;
    const manifests = repo.files.filter((f) => Object.hasOwn(MANIFESTS, f.split("/").pop() ?? ""));
    if (!manifests.length && !repo.components.length && !unsupported.length && !lockfiles.failed.length) return skip(msg("no_manifests"));
    // A workspace member (packages/x/package.json) is locked by a lockfile in any parent folder.
    const unlocked = manifests.filter((m) => {
      const parts = m.split("/");
      const locks = MANIFESTS[parts.pop()!];
      const dirs = parts.map((_, i) => parts.slice(0, i + 1).join("/") + "/");
      return !["", ...dirs].some((dir) => locks.some((lock) => files.has(dir + lock)));
    });
    const byEcosystem = Object.entries(Object.groupBy(repo.components, (c) => c.ecosystem)).map(([e, list]) => ({ text: `${e}: ${list?.length}` }));
    const params = { count: repo.components.length, lockfiles: msg("lockfiles", { count: repo.lockfiles.length }) };
    // A lockfile that gave nothing and a package file without a parser leave gaps in the SBOM: never a pass.
    const gaps: Finding[] = [
      ...lockfiles.failed.map(({ file, reason }) => ({ file, key: "failed_file", params: { reason: msg(`reason_${reason}`) } })),
      ...unsupported.map(({ file, ecosystem }) => ({ file, key: "unsupported_file", params: { ecosystem } })),
    ];
    const summary: Finding = { key: "summary", params };
    if (unlocked.length) return warn(msg("unlocked", { count: unlocked.length }), [...unlocked.map((file) => ({ file })), ...gaps, summary]);
    if (lockfiles.failed.length) return warn(msg("failed", { count: lockfiles.failed.length }), [...gaps, summary]);
    if (unsupported.length) {
      const ecosystems = [...new Set(unsupported.map((u) => u.ecosystem))].join(", ");
      return info(msg("unsupported", { count: unsupported.length, ecosystems }), [...gaps, summary]);
    }
    if (!repo.components.length) return info(msg("no_components", { lockfiles: msg("lockfiles", { count: repo.lockfiles.length }) }), lockfiles.empty.map((file) => ({ file })));
    return pass(msg("summary", params), byEcosystem);
  },
});

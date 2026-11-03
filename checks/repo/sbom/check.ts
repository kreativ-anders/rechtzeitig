import { MANIFESTS, defineRepoCheck, pass, skip, warn } from "../../../src/sdk.ts";

export default defineRepoCheck({
  run(repo) {
    const files = new Set(repo.files);
    const manifests = repo.files.filter((f) => Object.hasOwn(MANIFESTS, f.split("/").pop() ?? ""));
    if (!manifests.length && !repo.components.length) return skip("No package manifests in the repository.");
    // A workspace member (packages/x/package.json) is locked by a lockfile in any parent folder.
    const unlocked = manifests.filter((m) => {
      const parts = m.split("/");
      const locks = MANIFESTS[parts.pop()!];
      const dirs = parts.map((_, i) => parts.slice(0, i + 1).join("/") + "/");
      return !["", ...dirs].some((dir) => locks.some((lock) => files.has(dir + lock)));
    });
    const byEcosystem = Object.entries(Object.groupBy(repo.components, (c) => c.ecosystem)).map(([e, list]) => `${e}: ${list?.length}`);
    const summary = `${repo.components.length} components from ${repo.lockfiles.length} lockfile(s), written to rechtzeitig-sbom.cdx.json.`;
    if (unlocked.length) {
      return warn(`${unlocked.length} manifest(s) without a lockfile. Installed versions can change between builds.`, [...unlocked, summary]);
    }
    return pass(summary, byEcosystem);
  },
});

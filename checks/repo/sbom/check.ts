import { MANIFESTS, defineRepoCheck, msg, pass, skip, warn } from "../../../src/sdk.ts";

export default defineRepoCheck({
  run(repo) {
    const files = new Set(repo.files);
    const manifests = repo.files.filter((f) => Object.hasOwn(MANIFESTS, f.split("/").pop() ?? ""));
    if (!manifests.length && !repo.components.length) return skip(msg("no_manifests"));
    // A workspace member (packages/x/package.json) is locked by a lockfile in any parent folder.
    const unlocked = manifests.filter((m) => {
      const parts = m.split("/");
      const locks = MANIFESTS[parts.pop()!];
      const dirs = parts.map((_, i) => parts.slice(0, i + 1).join("/") + "/");
      return !["", ...dirs].some((dir) => locks.some((lock) => files.has(dir + lock)));
    });
    const byEcosystem = Object.entries(Object.groupBy(repo.components, (c) => c.ecosystem)).map(([e, list]) => ({ text: `${e}: ${list?.length}` }));
    const params = { count: repo.components.length, lockfiles: msg("lockfiles", { count: repo.lockfiles.length }) };
    if (unlocked.length) {
      return warn(msg("unlocked", { count: unlocked.length }), [...unlocked.map((file) => ({ file })), { key: "summary", params }]);
    }
    return pass(msg("summary", params), byEcosystem);
  },
});

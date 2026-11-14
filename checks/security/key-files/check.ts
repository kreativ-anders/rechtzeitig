import { capped, defineRepoCheck, fail, keyFiles, msg, pass, unreadResult, warn } from "../../../src/sdk.ts";

export default defineRepoCheck({
  run(repo) {
    // Paths, content markers and exclusions from data/key-files.yml (keyFiles in src/sdk.ts).
    const { finds, candidates } = keyFiles(repo);
    const details = capped(finds.map(({ level, ...f }) => f));
    if (finds.some((f) => f.level === "fail")) return fail(msg("found", { count: finds.length }), details);
    if (finds.length) return warn(msg("suspect", { count: finds.length }), details);
    // A dump, database or state file over the read limit or behind a Git LFS pointer: no pass (#85).
    return unreadResult(repo, candidates) ?? pass(msg("none"));
  },
});

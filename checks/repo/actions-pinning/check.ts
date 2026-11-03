import { defineRepoCheck, info, pass, skip } from "../../../src/sdk.ts";

const USES = /^\s*-?\s*uses:\s*["']?([^"'\s#]+)/gm;

export default defineRepoCheck({
  run(repo) {
    const workflows = repo.files.filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f));
    if (!workflows.length) return skip("No GitHub workflows.");
    const unpinned = workflows.flatMap((f) =>
      [...(repo.read(f) ?? "").matchAll(USES)]
        .map((m) => m[1])
        .filter((u) => !u.startsWith("./") && !u.startsWith("docker://") && !/@[0-9a-f]{40}$/.test(u))
        .map((u) => `${f}: ${u}`),
    );
    if (unpinned.length) {
      return info(`${unpinned.length} action(s) use a tag instead of a commit SHA. A moved tag can change the code that runs.`, [...new Set(unpinned)]);
    }
    return pass("All actions are pinned to a commit SHA.");
  },
});

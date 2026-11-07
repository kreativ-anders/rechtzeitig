import { WORKFLOWS, defineRepoCheck, info, lineAt, msg, pass, skip, type Finding } from "../../../src/sdk.ts";

const USES = /^[ \t]*-?[ \t]*uses:[ \t]*["']?([^"'\s#]+)/gm;

/** 1-based line of a position in a text. */

export default defineRepoCheck({
  run(repo) {
    const workflows = repo.find(WORKFLOWS);
    if (!workflows.length) return skip(msg("no_workflows"));
    const unpinned: Finding[] = workflows.flatMap((file) => {
      const text = repo.read(file) ?? "";
      return [...text.matchAll(USES)]
        .filter((m) => !m[1].startsWith("./") && !m[1].startsWith("docker://") && !/@[0-9a-f]{40}$/.test(m[1]))
        .map((m) => ({ file, line: lineAt(text, m.index), text: m[1] }));
    });
    if (unpinned.length) return info(msg("unpinned", { count: unpinned.length }), unpinned);
    return pass(msg("pinned"));
  },
});

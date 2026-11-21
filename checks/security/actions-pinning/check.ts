import { WORKFLOWS, defineRepoCheck, info, lineAt, msg, pass, skip, unreadResult, type Finding, type RepoContext } from "../../../src/sdk.ts";

const USES = /^[ \t]*-?[ \t]*uses:[ \t]*["']?([^"'\s#]+)/gm;
const SHA = /@[0-9a-f]{40}$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/;
/** A reusable workflow (`jobs.<id>.uses`): workflow lockfiles do not cover it, so it needs a SHA. */
const REUSABLE = /^[^/@]+\/[^/@]+\/\.github\/workflows\/[^@]+\.ya?ml@/;
/** GitHub's workflow lockfile, written by `gh actions-lock`. */
const LOCKFILE = ".github/workflows/actions.lock";

interface Lockfile {
  workflows?: Record<string, unknown>;
}

/** Locked `owner/repo@ref` entries per workflow, undefined without a lockfile, null when it cannot be read. */
function lockedRefs(repo: RepoContext): Map<string, Set<string>> | undefined | null {
  if (!repo.files.includes(LOCKFILE)) return undefined;
  const doc = repo.yaml<Lockfile>(LOCKFILE);
  if (!doc || typeof doc !== "object" || !doc.workflows || typeof doc.workflows !== "object") return null;
  const locked = new Map<string, Set<string>>();
  for (const [file, entries] of Object.entries(doc.workflows)) {
    if (!Array.isArray(entries)) return null;
    locked.set(file, new Set(entries.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase())));
  }
  return locked;
}

/** true when the lockfile records the action's repository at this ref for this workflow (`owner/repo/path@ref` is locked as `owner/repo@ref`). */
function isLocked(locked: Map<string, Set<string>> | undefined | null, file: string, uses: string): boolean {
  const m = /^([^/@]+)\/([^/@]+)(?:\/[^@]*)?@(.+)$/.exec(uses);
  return !!m && !!locked?.get(file)?.has(`${m[1]}/${m[2]}@${m[3]}`.toLowerCase());
}

function pinned(locked: Map<string, Set<string>> | undefined | null, file: string, uses: string): boolean {
  if (uses.startsWith("./") || uses.startsWith("$/")) return true;
  if (uses.startsWith("docker://")) return DIGEST.test(uses);
  if (SHA.test(uses)) return true;
  return !REUSABLE.test(uses) && isLocked(locked, file, uses);
}

export default defineRepoCheck({
  run(repo) {
    const workflows = repo.find(WORKFLOWS);
    if (!workflows.length) return skip(msg("no_workflows"));
    const locked = lockedRefs(repo);
    const unpinned: Finding[] = workflows.flatMap((file) => {
      const text = repo.read(file) ?? "";
      return [...text.matchAll(USES)]
        .filter((m) => !pinned(locked, file, m[1]))
        .map((m) => ({ file, line: lineAt(text, m.index), text: m[1] }));
    });
    const broken: Finding[] = locked === null && repo.read(LOCKFILE) !== undefined ? [{ file: LOCKFILE, key: "lockfile_unreadable" }] : [];
    if (unpinned.length) return info(msg("unpinned", { count: unpinned.length }), [...broken, ...unpinned]);
    if (broken.length) return info(msg("lockfile_unreadable"), broken);
    return unreadResult(repo, locked === undefined ? workflows : [...workflows, LOCKFILE]) ?? pass(msg("pinned"));
  },
});

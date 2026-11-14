import { capped, defineRepoCheck, fail, lineAt, loadYaml, msg, ownFiles, pass, unreadResult, warn, type Finding } from "../../../src/sdk.ts";

interface Entry {
  kind: string;
  path: string;
  contains?: string[];
  binary?: boolean;
  small?: boolean;
  level: "fail" | "warn";
}

const DATA = loadYaml<{ exclude: string[]; files: Entry[] }>("data/key-files.yml");
const EXCLUDE = DATA.exclude.map((p) => new RegExp(p, "i"));
const KINDS = DATA.files.map((e) => ({ ...e, pathRe: new RegExp(e.path, "i"), containsRe: e.contains?.map((p) => new RegExp(p, "m")) }));

export default defineRepoCheck({
  run(repo) {
    const binary = new Set(repo.coverage.binary);
    const found: Array<Finding & { level: "fail" | "warn" }> = [];
    // Files of a kind that may be larger than the read limit: unread ones keep the rule from passing.
    const gaps: string[] = [];
    for (const file of ownFiles(repo)) {
      if (EXCLUDE.some((re) => re.test(file))) continue;
      const kinds = KINDS.filter((k) => k.pathRe.test(file));
      if (!kinds.length) continue;
      if (kinds.some((k) => !k.small)) gaps.push(file);
      const text = repo.read(file);
      for (const k of kinds) {
        if (k.binary) {
          if (!binary.has(file)) continue;
          found.push({ level: k.level, file, key: k.kind });
          break;
        }
        const at = text === undefined ? undefined : k.containsRe?.map((re) => re.exec(text)?.index);
        if (!at?.length || at.some((i) => i === undefined)) continue;
        found.push({ level: k.level, file, line: lineAt(text!, at[0]!), key: k.kind });
        break;
      }
    }
    const details = capped(found.map(({ level, ...f }) => f));
    if (found.some((f) => f.level === "fail")) return fail(msg("found", { count: found.length }), details);
    if (found.length) return warn(msg("suspect", { count: found.length }), details);
    return unreadResult(repo, gaps) ?? pass(msg("none"));
  },
});

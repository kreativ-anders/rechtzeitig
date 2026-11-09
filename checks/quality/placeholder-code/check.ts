import { capped, codeFiles, defineRepoCheck, findInCode, info, loadYaml, msg, pass, skip, toFindings, type PatternSet } from "../../../src/sdk.ts";

const PATTERNS = loadYaml<Record<string, PatternSet>>("data/code-quality.yml")["quality/placeholder-code"];

export default defineRepoCheck({
  run(repo) {
    const files = codeFiles(repo);
    if (!files.length) return skip(msg("no_code"));
    const finds = findInCode(repo, files, PATTERNS);
    if (!finds.length) return pass(msg("none", { count: files.length }));
    // Files with the most finds first, so the list starts where most is left to do.
    const per = new Map<string, number>();
    for (const f of finds) per.set(f.file, (per.get(f.file) ?? 0) + 1);
    const sorted = [...finds].sort((a, b) => per.get(b.file)! - per.get(a.file)! || (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
    return info(msg("found", { count: finds.length, files: per.size }), capped(toFindings(sorted)));
  },
});

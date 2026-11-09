import { capped, codeFiles, defineRepoCheck, findInCode, lineAt, loadYaml, msg, pass, skip, toFindings, warn, type Finding, type Language, type PatternSet } from "../../../src/sdk.ts";

type Counts = Partial<Record<Language, string>>;
const DATA = loadYaml<Record<string, { tautology: PatternSet; swallowed: PatternSet; config: PatternSet; skipped: Counts; focused: Counts; cases: Counts; assertions: Counts }>>(
  "data/code-quality.yml",
)["quality/hollow-tests"];
const LIMITS = loadYaml<Record<string, { min_skipped: number; max_skipped_share: number }>>("data/thresholds.yml")["quality/hollow-tests"];
const re = (counts: Counts, flags = "gm") => Object.fromEntries(Object.entries(counts).map(([l, p]) => [l, new RegExp(p, flags)])) as Partial<Record<Language, RegExp>>;
const [CASES, ASSERTIONS, SKIPPED, FOCUSED] = [re(DATA.cases), re(DATA.assertions, "m"), re(DATA.skipped), re(DATA.focused)];
const IN_TESTS = merge(DATA.tautology, DATA.swallowed);

export default defineRepoCheck({
  run(repo) {
    const tests = codeFiles(repo, { tests: "only" }).filter((f) => CASES[f.language]);
    if (!tests.length) return skip(msg("no_tests"));
    const found: Finding[] = toFindings(findInCode(repo, tests, IN_TESTS));
    let cases = 0;
    let skipped = 0;
    for (const { file, language } of tests) {
      const text = repo.read(file) ?? "";
      const own = [...text.matchAll(CASES[language]!)];
      cases += own.length;
      skipped += SKIPPED[language] ? [...text.matchAll(SKIPPED[language]!)].length : 0;
      if (own.length && !ASSERTIONS[language]!.test(text)) found.push({ file, line: lineAt(text, own[0].index), key: "no_assertions", params: { count: own.length } });
      for (const m of FOCUSED[language] ? text.matchAll(FOCUSED[language]!) : []) found.push({ file, line: lineAt(text, m.index), key: "focused" });
    }
    found.push(...toFindings(findInCode(repo, codeFiles(repo), DATA.config)));
    if (skipped >= LIMITS.min_skipped && skipped / Math.max(cases, 1) >= LIMITS.max_skipped_share) {
      found.push({ key: "skipped_share", params: { count: skipped, cases } });
    }
    if (found.length) return warn(msg("hollow", { count: found.length }), capped(found));
    return pass(msg("clean", { count: cases, files: tests.length }));
  },
});

/** Two pattern sets as one, the lists of each language joined. */
function merge(a: PatternSet, b: PatternSet): PatternSet {
  const out: PatternSet = { ...a };
  for (const [l, list] of Object.entries(b) as Array<[Language, PatternSet[Language]]>) out[l] = [...(out[l] ?? []), ...(list ?? [])];
  return out;
}

import { WORKFLOWS, capped, codeFiles, defineRepoCheck, findInCode, loadYaml, msg, pass, skip, toFindings, warn, type Finding, type PatternSet } from "../../../src/sdk.ts";

const DATA = loadYaml<Record<string, { check_words: string; harmless_steps: string; commands: PatternSet; suppressions: PatternSet }>>("data/code-quality.yml")["quality/neutralized-ci"];
const LIMITS = loadYaml<Record<string, { top_lines: number; min_files: number; min_share: number }>>("data/thresholds.yml")["quality/neutralized-ci"];
const CHECK_WORDS = new RegExp(DATA.check_words, "i");
const HARMLESS = new RegExp(DATA.harmless_steps, "i");
/** A step or job that may fail, or is switched off, without the run failing. */
const LOOSE = /^(\s*)(?:-\s+)?(continue-on-error|if):\s*(?:true|false|\$\{\{\s*(?:true|false)\s*\}\})\s*(?:#.*)?$/;

const indent = (line: string) => line.match(/^\s*/)![0].length;

/**
 * The lines of the step or job a key belongs to: up from the key to the list item ("- ") or mapping key that holds
 * it, down to the next line at that indent or less.
 */
function block(lines: string[], at: number): string {
  const own = indent(lines[at]);
  let start = at;
  // A key written on the list item itself ("- continue-on-error: true") starts its own step.
  if (!/^\s*-\s/.test(lines[at])) {
    for (let i = at - 1; i >= 0; i--) {
      if (!lines[i].trim() || lines[i].trimStart().startsWith("#")) continue;
      const dash = /^(\s*)-\s/.exec(lines[i]);
      if ((dash && dash[1].length < own) || (!dash && indent(lines[i]) < own)) {
        start = i;
        break;
      }
    }
  }
  const base = indent(lines[start]);
  let end = at + 1;
  while (end < lines.length && (!lines[end].trim() || indent(lines[end]) > base)) end++;
  return lines.slice(start, end).join("\n");
}

/** `continue-on-error: true` or `if: false` on a step or job that runs a check (`check_words`), outside harmless steps. */
function looseChecks(file: string, text: string): Finding[] {
  const lines = text.split("\n");
  return lines.flatMap((line, i) => {
    const m = LOOSE.exec(line);
    if (!m || (m[2] === "continue-on-error") !== /true/.test(line)) return [];
    const b = block(lines, i);
    if (!CHECK_WORDS.test(b) || HARMLESS.test(b)) return [];
    return [{ file, line: i + 1, key: m[2] === "if" ? "disabled_step" : "continue_on_error" }];
  });
}

export default defineRepoCheck({
  run(repo) {
    const code = codeFiles(repo);
    const workflows = repo.find(WORKFLOWS).filter((f) => code.some((c) => c.file === f));
    if (!code.length) return skip(msg("no_code"));
    const found: Finding[] = workflows.flatMap((f) => looseChecks(f, repo.read(f) ?? ""));
    found.push(...toFindings(findInCode(repo, code, DATA.commands)));
    // File-wide suppressions count only in the first lines and only when many files have them.
    const suppressed = findInCode(repo, code, DATA.suppressions).filter((f) => f.line <= LIMITS.top_lines);
    const files = [...new Set(suppressed.map((f) => f.file))];
    const sameLanguage = code.filter((c) => suppressed.some((s) => s.language === c.language)).length;
    if (files.length >= LIMITS.min_files && files.length / Math.max(sameLanguage, 1) >= LIMITS.min_share) {
      found.push({ key: "suppressed_files", params: { count: files.length, total: sameLanguage } }, ...files.map((file) => ({ file, line: suppressed.find((s) => s.file === file)!.line, key: "suppressed" })));
    }
    if (found.length) return warn(msg("neutralized", { count: found.length }), capped(found));
    return pass(msg("none", { count: workflows.length }));
  },
});

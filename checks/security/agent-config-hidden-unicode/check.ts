import { FIXTURES, WORKFLOWS, capped, defineRepoCheck, fail, loadYaml, msg, pass, skip, type Finding } from "../../../src/sdk.ts";

type Where = "instructions" | "code";
const UNI = loadYaml<{ classes: Record<string, { ranges: string[]; where: Where[] }>; flag_base: string; code_extensions: string[]; test_files: string }>(
  "data/hidden-unicode.yml",
);
const AGENT = loadYaml<{ instructions: string[] }>("data/agent-files.yml");
const INSTRUCTIONS = AGENT.instructions.map((p) => new RegExp(p));
const CODE = new RegExp(`\\.(${UNI.code_extensions.join("|")})$`, "i");
const TESTS = new RegExp(UNI.test_files);
// Generated files: no person reads them as source.
const GENERATED = /\.min\.(js|css)$|\.map$|(^|\/)(node_modules|vendor|dist)\//;

const hex = (h: string) => parseInt(h, 16);
const CLASSES = Object.entries(UNI.classes).map(([name, c]) => ({
  name,
  where: new Set(c.where),
  ranges: c.ranges.map((r) => r.split("-").map(hex)).map(([lo, hi]) => [lo, hi ?? lo] as const),
}));
const FLAG_BASE = hex(UNI.flag_base);
const TAG_END = 0xe007f;
const ZWJ = 0x200d;
const BOM = 0xfeff;
const PICTO = /\p{Extended_Pictographic}/u;

const classOf = (cp: number, where: Where) =>
  CLASSES.find((c) => c.where.has(where) && c.ranges.some(([lo, hi]) => cp >= lo && cp <= hi))?.name;

/** Hidden characters per class in one text, with the line of the first, skipping their legitimate uses. */
function hidden(text: string, where: Where): Map<string, { count: number; line: number }> {
  const found = new Map<string, { count: number; line: number }>();
  const chars = [...text];
  let line = 1;
  let inFlag = false;
  chars.forEach((ch, i) => {
    if (ch === "\n") line++;
    const cp = ch.codePointAt(0)!;
    if (cp === FLAG_BASE) inFlag = true;
    else if (inFlag && cp >= 0xe0000 && cp <= TAG_END) {
      if (cp === TAG_END) inFlag = false;
      return; // part of an emoji subdivision flag
    } else inFlag = false;
    if (cp === BOM && i === 0) return;
    if (cp === ZWJ && PICTO.test(chars[i - 1] ?? "") && PICTO.test(chars[i + 1] ?? "")) return; // emoji sequence
    const name = classOf(cp, where);
    if (!name) return;
    const f = found.get(name) ?? { count: 0, line };
    f.count++;
    found.set(name, f);
  });
  return found;
}

export default defineRepoCheck({
  run(repo) {
    const findings: Finding[] = [];
    let scanned = 0;
    for (const file of repo.files) {
      if (FIXTURES.test(file) || GENERATED.test(file)) continue;
      const where: Where | undefined = INSTRUCTIONS.some((re) => re.test(file)) ? "instructions" : (CODE.test(file) && !TESTS.test(file)) || WORKFLOWS.test(file) ? "code" : undefined;
      if (!where) continue;
      const text = repo.read(file);
      if (text === undefined) continue;
      scanned++;
      // Most files are plain ASCII: nothing to look at.
      if (!/[^\x00-\x7f]/.test(text)) continue;
      for (const [kind, f] of hidden(text, where)) {
        findings.push({ file, line: f.line, key: `class_${kind}`, params: { count: f.count, where: msg(`where_${where}`) } });
      }
    }
    if (!scanned) return skip(msg("no_files"));
    if (findings.length) return fail(msg("found", { count: findings.length }), capped(findings));
    return pass(msg("none", { count: scanned }));
  },
});

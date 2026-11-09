import { FIXTURES, capped, defineRepoCheck, info, lineAt, loadYaml, msg, skip, warn, type Finding } from "../../../src/sdk.ts";

interface Model { license: string; kind: "noncommercial" | "conditions"; terms: string; ids: string[]; files?: string[]; source: string }
const DATA = loadYaml<{ weight_files: string; skip_files: string; models: Model[] }>("data/ai-models.yml");
const WEIGHTS = new RegExp(DATA.weight_files, "i");
const MODELS = DATA.models.map((m) => ({ ...m, idRes: m.ids.map((p) => new RegExp(p, "i")), fileRes: (m.files ?? []).map((p) => new RegExp(p, "i")) }));

/** Files that name models: code, notebooks and configuration. */
const CODE = /\.(py|ipynb|js|mjs|cjs|ts|tsx|jsx|go|rs|java|kt|rb|php|json|ya?ml|toml|env\.example|cfg|ini)$|(^|\/)(Modelfile|Dockerfile)$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|poetry\.lock|uv\.lock|Cargo\.lock)$/;
/** Tests name models as data, not as a use: *.test.ts, test_*.py, *_test.go, test/ and tests/ folders. */
const TESTS = /(^|\/)(tests?|__tests__|spec)\/|(^|\/)test\.[cm]?[jt]sx?$|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/;
/** "org/name" in a huggingface.co URL (also before /resolve/main/...), or alone, not as part of a path, a package (@org/name) or a pattern (^org/name). */
const HF_URL = /huggingface\.co\/([A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95})/g;
const BARE_ID = /(?<![\w./@^-])([A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95})(?![\w/-])/g;
const SKIP = new RegExp(DATA.skip_files, "i");

export default defineRepoCheck({
  run(repo) {
    const findings: Array<Finding & { kind: Model["kind"] }> = [];
    const seen = new Set<string>();
    for (const file of repo.files.filter((f) => CODE.test(f) && !FIXTURES.test(f) && !TESTS.test(f) && !LOCKFILE.test(f) && !SKIP.test(f))) {
      const text = repo.read(file);
      if (!text) continue;
      for (const m of [...text.matchAll(HF_URL), ...text.matchAll(BARE_ID)].sort((a, b) => a.index - b.index)) {
        const id = m[1].replace(/\.git$/, "");
        const model = MODELS.find((x) => x.idRes.some((re) => re.test(id)));
        if (!model || seen.has(`${file}\n${id}`)) continue;
        seen.add(`${file}\n${id}`);
        const params = { model: id, license: model.license, terms: msg(`terms_${model.terms}`), source: model.source };
        findings.push({ file, line: lineAt(text, m.index), key: model.kind, params, kind: model.kind });
      }
    }
    const weights = repo.files.filter((f) => WEIGHTS.test(f) && !FIXTURES.test(f) && !TESTS.test(f));
    for (const file of weights) {
      const name = file.split("/").pop()!;
      const model = MODELS.find((x) => x.fileRes.some((re) => re.test(name)));
      if (model) {
        const params = { model: name, license: model.license, terms: msg(`terms_${model.terms}`), source: model.source };
        findings.push({ file, key: model.kind, params, kind: model.kind });
      } else findings.push({ file, key: "weights_unknown", kind: "conditions" });
    }
    if (!findings.length) return skip(msg("none"));
    const details = capped(findings.map(({ kind: _, ...f }) => f));
    const noncommercial = findings.filter((f) => f.kind === "noncommercial").length;
    if (noncommercial) return warn(msg("noncommercial_found", { count: noncommercial }), details);
    return info(msg("conditions_found", { count: findings.length }), details);
  },
});

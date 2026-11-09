import { codeFiles, codeResult, defineRepoCheck, findInCode, isClientFile, loadYaml, type CodePattern, type PatternSet } from "../../../src/sdk.ts";

const { client, ...everywhere } = loadYaml<Record<string, PatternSet & { client: CodePattern[] }>>("data/insecure-code.yml")["security/llm-key-in-browser"];

export default defineRepoCheck({
  run(repo) {
    const files = codeFiles(repo);
    const browser = files.filter((f) => isClientFile(repo, f.file));
    const finds = [...findInCode(repo, files, everywhere), ...findInCode(repo, browser, { js: client })];
    return codeResult(files, finds.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1)));
  },
});

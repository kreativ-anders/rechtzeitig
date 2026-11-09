import { codeFiles, codeResult, defineRepoCheck, findInCode, loadYaml, type PatternSet } from "../../../src/sdk.ts";

const PATTERNS = loadYaml<Record<string, PatternSet>>("data/insecure-code.yml")["security/tls-verification-off"];

export default defineRepoCheck({
  run(repo) {
    const files = codeFiles(repo);
    return codeResult(files, findInCode(repo, files, PATTERNS));
  },
});

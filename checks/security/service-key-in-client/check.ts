import { codeFiles, codeResult, defineRepoCheck, findInCode, isClientFile, loadYaml, msg, skip, type CodePattern } from "../../../src/sdk.ts";

const { client } = loadYaml<Record<string, { client: CodePattern[] }>>("data/insecure-code.yml")["security/service-key-in-client"];

export default defineRepoCheck({
  run(repo) {
    const browser = codeFiles(repo).filter((f) => isClientFile(repo, f.file));
    if (!browser.length) return skip(msg("no_client"));
    return codeResult(browser, findInCode(repo, browser, { js: client }));
  },
});

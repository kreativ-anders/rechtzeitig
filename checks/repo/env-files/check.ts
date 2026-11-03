import { defineRepoCheck, fail, pass, warn } from "../../../src/sdk.ts";

const ENV = /(^|\/)\.env(\.[\w-]+)?$/;
const TEMPLATE = /\.(example|sample|template|dist|defaults)$/;
const IGNORES_ENV = /^\/?(\*\*\/)?\.env(\*|\.\*|\.local)?$|^\*\.env$/m;

export default defineRepoCheck({
  title: ".env files stay out of git",
  law: "Art. 32 GDPR",
  run(repo) {
    const tracked = repo.files.filter((f) => ENV.test(f) && !TEMPLATE.test(f));
    if (tracked.length) return fail(`${tracked.length} .env file(s) are committed. Their values are in the git history.`, tracked);
    const usesEnv = repo.files.some((f) => ENV.test(f)) || ["package.json", "composer.json"].some((m) => repo.files.includes(m));
    if (usesEnv && !IGNORES_ENV.test(repo.read(".gitignore") ?? "")) {
      return warn('.gitignore does not ignore .env. Add ".env" so local secrets are not committed by accident.');
    }
    return pass("No .env file is committed.");
  },
});

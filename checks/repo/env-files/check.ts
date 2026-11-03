import { defineRepoCheck, fail, info, pass, warn } from "../../../src/sdk.ts";

const ENV = /(^|\/)\.env(\.[\w-]+)?$/;
const TEMPLATE = /\.(example|sample|template|dist|defaults)$/;
const FIXTURES = /(^|\/)fixtures?\//;
const IGNORES_ENV = /^\/?(\*\*\/)?\.env(\*|\.\*|\.local)?$|^\*\.env$/m;

export default defineRepoCheck({
  run(repo) {
    const tracked = repo.files.filter((f) => ENV.test(f) && !TEMPLATE.test(f) && !FIXTURES.test(f));
    if (tracked.length) return fail(`${tracked.length} .env file(s) are committed. Their values are in the git history.`, tracked);
    if (!IGNORES_ENV.test(repo.read(".gitignore") ?? "")) {
      const message = '.gitignore does not ignore .env. Add ".env" so local secrets are not committed by accident.';
      // A template means the project expects a local .env; otherwise this is only a precaution.
      if (repo.files.some((f) => ENV.test(f) && !FIXTURES.test(f))) return warn(message);
      if (["package.json", "composer.json", "pyproject.toml"].some((m) => repo.files.includes(m))) return info(message);
    }
    return pass("No .env file is committed.");
  },
});

import { FIXTURES, defineRepoCheck, fail, info, isSoftwareProject, msg, pass, warn } from "../../../src/sdk.ts";

const ENV = /(^|\/)\.env(\.[\w-]+)*$/;
const TEMPLATE = /\.(example|sample|template|dist|defaults)$/;
const IGNORES_ENV = /^\/?(\*\*\/)?\.env(\*|\.\*|\.local)?$|^\*\.env$/m;

export default defineRepoCheck({
  run(repo) {
    const tracked = repo.files.filter((f) => ENV.test(f) && !TEMPLATE.test(f) && !FIXTURES.test(f));
    if (tracked.length) return fail(msg("committed", { count: tracked.length }), tracked.map((file) => ({ file })));
    if (!IGNORES_ENV.test(repo.read(".gitignore") ?? "")) {
      const message = msg("not_ignored");
      const details = repo.files.includes(".gitignore") ? [{ file: ".gitignore" }] : undefined;
      // A template means the project expects a local .env; otherwise this is only a precaution.
      if (repo.files.some((f) => ENV.test(f) && !FIXTURES.test(f))) return warn(message, details);
      if (isSoftwareProject(repo)) return info(message, details);
    }
    return pass(msg("none"));
  },
});

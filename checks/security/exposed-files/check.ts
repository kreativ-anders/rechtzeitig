import { defineCheck, fail, pass } from "../../../src/sdk.ts";

export default defineCheck({
  title: "No private files are public",
  law: "Art. 32 GDPR",
  run(ctx) {
    const files = ctx.probes.filter((p) => p.kind === "file");
    const exposed = files.filter((p) => p.exposed);
    if (exposed.length) {
      return fail(`${exposed.length} private file(s) can be downloaded. Remove them or block them in the web server.`, exposed.map((p) => p.path));
    }
    return pass(`None of ${files.length} common private paths (.env, .git, backups, phpinfo) is public.`);
  },
});

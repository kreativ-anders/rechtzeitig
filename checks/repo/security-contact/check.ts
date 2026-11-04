import { MANIFESTS, defineRepoCheck, info, msg, parseSecurityTxt, pass, skip, warn } from "../../../src/sdk.ts";

/** Where GitHub shows a security policy. */
const POLICY = /^(\.github\/|docs\/)?SECURITY\.md$/i;
const SECURITY_TXT = /(^|\/)\.well-known\/security\.txt$/;

export default defineRepoCheck({
  run(repo) {
    if (!Object.keys(MANIFESTS).some((m) => repo.files.includes(m))) return skip(msg("no_project"));
    const policy = repo.find(POLICY)[0];
    const txts = repo.find(SECURITY_TXT);
    for (const file of txts) {
      const parsed = parseSecurityTxt(repo.read(file) ?? "");
      if (!parsed) return warn(msg("txt_no_contact"), [{ file }]);
      if (parsed.expired) return warn(msg("txt_expired", { date: parsed.expires ?? "" }), [{ file }]);
    }
    if (policy || txts.length) return pass(msg("found"), [policy, ...txts].filter(Boolean).map((file) => ({ file })));
    return info(msg("missing"));
  },
});

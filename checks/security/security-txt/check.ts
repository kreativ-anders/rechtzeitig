import { defineCheck, info, msg, parseSecurityTxt, pass, warn } from "../../../src/sdk.ts";

const PATH = "/.well-known/security.txt";

export default defineCheck({
  run(ctx) {
    const probe = ctx.probes.find((p) => p.path === PATH);
    const file = probe?.status === 200 ? parseSecurityTxt(probe.body) : undefined;
    if (!file) return info(msg("missing"), [{ text: PATH }]);
    const details = file.contact.map((text) => ({ text }));
    if (!file.expires) return warn(msg("no_expires"), details);
    if (file.expired) return warn(msg("expired", { date: file.expires }), details);
    return pass(msg("found", { contact: file.contact[0] }), details);
  },
});

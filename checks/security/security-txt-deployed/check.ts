import { FIXTURES, defineCrossCheck, info, msg, parseSecurityTxt, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const PATH = "/.well-known/security.txt";
const SECURITY_TXT = /(^|\/)\.well-known\/security\.txt$/;
const contactKey = (c: string) => c.trim().toLowerCase();

export default defineCrossCheck({
  run(ctx, repo) {
    // The project's own file, for example in public/ or static/; example files in test fixtures do not count.
    const files = repo.find(SECURITY_TXT).filter((f) => !FIXTURES.test(f));
    if (!files.length) return skip(msg("no_file"));
    const file = files.find((f) => parseSecurityTxt(repo.read(f) ?? ""));
    if (!file) return info(msg("unreadable"), files.map((f) => ({ file: f })));
    const own = parseSecurityTxt(repo.read(file)!)!;

    const probe = ctx.probes.find((p) => p.path === PATH);
    const live = probe?.status === 200 ? parseSecurityTxt(probe.body) : undefined;
    if (!live) return warn(msg("not_served", { status: probe?.status ?? 0 }), [{ file }]);
    if (live.expired && !own.expired) return warn(msg("outdated", { date: live.expires ?? "" }), [{ file }]);

    const served = new Set(live.contact.map(contactKey));
    const ours = new Set(own.contact.map(contactKey));
    const differ: Finding[] = [
      ...own.contact.filter((c) => !served.has(contactKey(c))).map((contact) => ({ file, key: "only_repo", params: { contact } })),
      ...live.contact.filter((c) => !ours.has(contactKey(c))).map((contact) => ({ key: "only_site", params: { contact } })),
    ];
    if (differ.length) return warn(msg("contacts_differ"), differ);
    return pass(msg("same", { contact: own.contact[0] }), [{ file }]);
  },
});

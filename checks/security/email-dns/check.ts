import { defineCheck, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

// "all", "+all" and "?all" let every server send mail for the domain; "~all" and "-all" do not.
const OPEN_SPF = /(^|\s)[+?]?all\b/i;

export default defineCheck({
  run(ctx) {
    const dns = ctx.dns;
    if (!dns) return skip(msg("not_checked"));
    const { domain, spf, dmarc } = dns;
    const issues: Finding[] = [];
    if (!spf) issues.push({ key: dns.mx ? "no_spf" : "no_spf_no_mail" });
    else if (OPEN_SPF.test(spf)) issues.push({ key: "open_spf", params: { spf } });
    if (!dmarc) issues.push({ key: "no_dmarc", params: { domain } });
    // p= only; sp= is the policy for subdomains.
    else if (/(^|;)\s*p=none\b/i.test(dmarc)) issues.push({ key: "dmarc_none" });
    if (issues.length) return warn(msg("spoofable", { domain }), issues);
    return pass(msg("set"), [{ text: spf ?? "" }, { text: dmarc ?? "" }]);
  },
});

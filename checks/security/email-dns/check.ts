import { defineCheck, pass, skip, warn } from "../../../src/sdk.ts";

// "all", "+all" and "?all" let every server send mail for the domain; "~all" and "-all" do not.
const OPEN_SPF = /(^|\s)[+?]?all\b/i;

export default defineCheck({
  run(ctx) {
    const dns = ctx.dns;
    if (!dns) return skip("DNS was not checked.");
    const { domain, spf, dmarc } = dns;
    const issues: string[] = [];
    if (!spf) issues.push(`No SPF record. ${dns.mx ? "List your mail servers" : 'The domain sends no mail, so publish "v=spf1 -all"'}.`);
    else if (OPEN_SPF.test(spf)) issues.push(`SPF allows every server to send mail ("${spf}"). End it with "-all" or "~all".`);
    if (!dmarc) issues.push(`No DMARC record at _dmarc.${domain}. Start with "v=DMARC1; p=quarantine".`);
    // p= only; sp= is the policy for subdomains.
    else if (/(^|;)\s*p=none\b/i.test(dmarc)) issues.push(`DMARC only monitors (p=none). Mail that fails checks is still delivered.`);
    if (issues.length) return warn(`Others can send email in the name of ${domain}.`, issues);
    return pass("SPF and DMARC are set.", [spf ?? "", dmarc ?? ""]);
  },
});

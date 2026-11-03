import { defineCheck, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  title: "Domain is protected against email spoofing",
  law: "Art. 32 GDPR",
  run(ctx) {
    const dns = ctx.dns;
    if (!dns) return skip("DNS was not checked.");
    const domain = new URL(ctx.url).hostname.replace(/^www\./, "");
    const issues: string[] = [];
    if (!dns.spf) issues.push(`No SPF record. ${dns.mx ? "List your mail servers" : 'The domain sends no mail, so publish "v=spf1 -all"'}.`);
    if (!dns.dmarc) issues.push(`No DMARC record at _dmarc.${domain}. Start with "v=DMARC1; p=quarantine".`);
    else if (/p=none/i.test(dns.dmarc)) issues.push(`DMARC only monitors (p=none). Mail that fails checks is still delivered.`);
    if (issues.length) return warn(`Others can send email in the name of ${domain}.`, issues);
    return pass("SPF and DMARC are set.", [dns.spf ?? "", dns.dmarc ?? ""]);
  },
});

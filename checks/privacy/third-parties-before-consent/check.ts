import { defineCheck, fail, pass, warn, type Vendor } from "../../../src/sdk.ts";

interface Contact {
  vendor?: Vendor;
  hosts: Set<string>;
  pages: Set<string>;
}

export default defineCheck({
  title: "No third-party servers before consent",
  law: "Art. 6(1) GDPR, § 25 TDDDG",
  run(ctx) {
    const contacts = new Map<string, Contact>();
    for (const page of ctx.sitePages) {
      for (const request of [...page.noJs.requests, ...page.js.requests]) {
        if (!ctx.isThirdParty(request.host)) continue;
        const vendor = ctx.vendor(request.host);
        const key = vendor?.name ?? request.host;
        const contact = contacts.get(key) ?? { vendor, hosts: new Set(), pages: new Set() };
        contact.hosts.add(request.host);
        contact.pages.add(ctx.short(page.url));
        contacts.set(key, contact);
      }
    }

    const line = (name: string, c: Contact) =>
      `${name} (${[...c.hosts].join(", ")}) on ${[...c.pages].join(", ")}.${c.vendor?.advice ? ` ${c.vendor.advice}` : ""}`;
    const needConsent = [...contacts].filter(([, c]) => c.vendor?.consent === "required");
    const others = [...contacts].filter(([, c]) => c.vendor?.consent !== "required");
    const details = [...needConsent, ...others].map(([name, c]) => line(name, c));
    const names = (list: typeof needConsent) => list.map(([name]) => name).join(", ");

    if (needConsent.length) {
      return fail(`Loaded before consent: ${names(needConsent)}. Each visit sends the visitor's IP address to them.`, details);
    }
    if (others.length) {
      return warn(`Contacted before consent: ${names(others)}. Check the legal basis and name them in the privacy policy.`, details);
    }
    return pass("Only the site's own servers are contacted before consent.");
  },
});

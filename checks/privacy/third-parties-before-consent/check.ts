import { defineCheck, fail, pass, thirdPartyServices, warn, type Service } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const services = [...thirdPartyServices(ctx).values()];
    const line = (s: Service) => `${s.name} (${[...s.hosts].join(", ")}) on ${[...s.pages].join(", ")}.${s.vendor?.advice ? ` ${s.vendor.advice}` : ""}`;
    const needConsent = services.filter((s) => s.vendor?.consent === "required");
    const others = services.filter((s) => s.vendor?.consent !== "required");
    const details = [...needConsent, ...others].map(line);
    const names = (list: Service[]) => list.map((s) => s.name).join(", ");

    if (needConsent.length) {
      return fail(`Loaded before consent: ${names(needConsent)}. Each visit sends the visitor's IP address to them.`, details);
    }
    if (others.length) {
      return warn(`Contacted before consent: ${names(others)}. Check the legal basis and name them in the privacy policy.`, details);
    }
    return pass("Only the site's own servers are contacted before consent.");
  },
});

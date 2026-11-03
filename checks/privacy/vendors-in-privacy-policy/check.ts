import { defineCheck, needLegalPage, pass, thirdPartyServices, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;

    const services = [...thirdPartyServices(ctx).values()];
    if (!services.length) return pass("The site uses no third-party services before consent.");

    // Unknown services: the domain without its suffix ("example-cdn" for cdn.example-cdn.co.uk).
    const names = (s: (typeof services)[number]) => s.vendor?.names ?? [s.name.split(".")[0]];
    const missing = services.filter((s) => !names(s).some((n) => ctx.mentions(policy.js.text, n))).map((s) => s.name);
    if (missing.length) {
      return warn(`The privacy policy does not mention ${missing.length} of ${services.length} service(s) the site uses.`, missing);
    }
    return pass(`All ${services.length} service(s) are mentioned in the privacy policy.`);
  },
});

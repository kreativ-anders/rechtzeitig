import { defineCheck, loadedPage, pass, skip, warn } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const policy = loadedPage(ctx, "privacy");
    if (!policy) return skip("No privacy policy to read (see legal/privacy-policy).");

    // Service name → names a policy could use for it.
    const services = new Map<string, string[]>();
    for (const page of ctx.sitePages) {
      for (const request of [...page.noJs.requests, ...page.js.requests]) {
        if (!ctx.isThirdParty(request.host)) continue;
        const vendor = ctx.vendor(request.host);
        if (vendor) services.set(vendor.name, vendor.names);
        else services.set(request.host, [request.host.split(".").slice(-2)[0]]);
      }
    }
    if (!services.size) return pass("The site uses no third-party services before consent.");

    const missing = [...services].filter(([, names]) => !names.some((n) => ctx.mentions(policy.js.text, n))).map(([name]) => name);
    if (missing.length) {
      return warn(`The privacy policy does not mention ${missing.length} of ${services.size} service(s) the site uses.`, missing);
    }
    return pass(`All ${services.size} service(s) are mentioned in the privacy policy.`);
  },
});

import { capped, defineCrossCheck, directPackages, info, msg, needLegalPage, pass, skip, thirdPartyServices, warn, type DirectPackage, type Finding, type Vendor } from "../../../src/sdk.ts";

export default defineCrossCheck({
  run(ctx, repo) {
    const { packages, unread } = directPackages(repo);
    if (!packages.length && !unread.length) return skip(msg("no_packages"));
    const policy = needLegalPage(ctx, "privacy");
    if ("status" in policy) return policy;

    // Vendor → the first package of its SDK (`packages` in data/third-parties.yml).
    const sdks = new Map<string, { vendor: Vendor; pkg: DirectPackage }>();
    for (const pkg of packages) {
      const vendor = ctx.packageVendor(pkg.name);
      if (vendor && !sdks.has(vendor.name)) sdks.set(vendor.name, { vendor, pkg });
    }
    // What the visited pages contacted is privacy/vendors-in-privacy-policy's job; this check covers what the
    // scan cannot see: server SDKs (payments, AI, databases) and SDKs on pages it did not visit.
    const contacted = new Set(thirdPartyServices(ctx).keys());
    const unseen = [...sdks.values()].filter((s) => !contacted.has(s.vendor.name));
    const missing = unseen.filter((s) => !s.vendor.names.some((n) => ctx.mentions(policy.js.text, n)));

    const gap: Finding[] = unread.map((file) => ({ file, key: "unread" }));
    if (missing.length) {
      const found: Finding[] = missing.map(({ vendor, pkg }) => ({
        file: pkg.file, line: pkg.line, key: "package", params: { vendor: vendor.name, package: pkg.name, purpose: vendor.purpose },
      }));
      return warn(msg("missing", { count: missing.length }), capped([...found, ...gap]));
    }
    // A package.json that could not be read may hold an SDK: never a pass then.
    if (gap.length) return info(msg("unread_files", { count: gap.length }), gap);
    if (!unseen.length) return pass(msg("none_unseen", { count: sdks.size }));
    return pass(msg("all", { count: unseen.length }), unseen.map((s) => ({ text: s.vendor.name })));
  },
});

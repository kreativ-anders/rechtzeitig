import { defineRepoCheck, dependencyLicenseResult, msg, offending, readLicense, unavoidable, type Classified } from "../../../src/sdk.ts";

const network = (t: Classified) => t.category === "network_copyleft";
/** Families with their own explanation in lang/*.yml; the rest use `other`. */
const FAMILIES = ["agpl", "eupl", "osl"];

export default defineRepoCheck({
  run(repo) {
    // A project under a network copyleft license already offers its source to users.
    if (readLicense(repo.license).alternatives.flat().some(network)) {
      const result = dependencyLicenseResult(repo, () => undefined);
      return result.status === "pass" ? { ...result, message: msg("project_network", { project: repo.license }) } : result;
    }
    return dependencyLicenseResult(repo, (license) => {
      if (!unavoidable(license, network)) return undefined;
      const family = offending(license, network)?.family ?? "";
      return FAMILIES.includes(family) ? family : "other";
    });
  },
});

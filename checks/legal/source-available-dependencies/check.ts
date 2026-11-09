import { defineRepoCheck, dependencyLicenseResult, offending, unavoidable, type Classified } from "../../../src/sdk.ts";

const restricted = (t: Classified) => t.category === "source_available";
/** Families of data/licenses.yml `source_available`, each with its own explanation in lang/*.yml. */
const FAMILIES = ["busl", "sspl", "elastic", "fsl", "polyform", "commons_clause", "sustainable_use", "noncommercial", "proprietary"];

export default defineRepoCheck({
  run(repo) {
    return dependencyLicenseResult(repo, (license) => {
      if (!unavoidable(license, restricted)) return undefined;
      const family = offending(license, restricted)?.family ?? "";
      return FAMILIES.includes(family) ? family : "proprietary";
    });
  },
});

import { defineRepoCheck, dependencyLicenseResult, msg, readLicense, unavoidable, type Classified } from "../../../src/sdk.ts";

// Strong copyleft: GPL or AGPL without a linking exception (that makes it weak copyleft, data/licenses.yml).
const strong = (t: Classified) => (t.category === "copyleft" || t.category === "network_copyleft") && (t.family === "gpl" || t.family === "agpl");
const network = (t: Classified) => t.category === "network_copyleft";
// Only the explicit id: the deprecated GPL-2.0 and a GPLv2 LICENSE text do not say whether later versions are allowed.
const gpl2Only = (id: string) => /^GPL-2\.0-only$/i.test(id);
const v3 = (id: string) => /^A?GPL-3\.0/i.test(id);

export default defineRepoCheck({
  run(repo) {
    const project = readLicense(repo.license);
    const terms = project.alternatives.flat();
    const gplProject = terms.some(strong);
    const networkProject = terms.some(network);
    // A project under GPL-2.0-only cannot take GPLv3 code or Apache-2.0 (gnu.org license list); GPLv3 cannot take GPL-2.0-only.
    const only2 = gplProject && terms.filter(strong).every((t) => gpl2Only(t.id));
    const only3 = gplProject && terms.filter(strong).every((t) => v3(t.id));
    const incompatible = (t: Classified) =>
      (only2 && (v3(t.id) || /^LGPL-3\.0/i.test(t.id) || /^Apache-2\.0$/i.test(t.id))) || (only3 && strong(t) && gpl2Only(t.id));
    return dependencyLicenseResult(repo, (license) => {
      // legal/network-copyleft reports these.
      if (!networkProject && unavoidable(license, network)) return undefined;
      if (!gplProject) return unavoidable(license, strong) ? (project.status === "ok" ? "gpl" : "gpl_no_project") : undefined;
      return unavoidable(license, incompatible) ? "version_conflict" : undefined;
    }, { project: repo.license || msg("no_project") });
  },
});

import { capped, compareVersions, defineRepoCheck, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

interface Relicensing { package: string; ecosystem: string; from: string; before: string; license: string; fork?: string; source: string }
const EVENTS = loadYaml<Relicensing[]>("data/relicensing.yml");

export default defineRepoCheck({
  run(repo) {
    const production = repo.components.filter((c) => !c.dev);
    if (!production.length) return skip(msg("no_components"));
    const findings: Finding[] = production.flatMap((c) => {
      const e = EVENTS.find((e) => e.ecosystem === c.ecosystem && e.package === c.name && compareVersions(c.version, e.from) >= 0);
      if (!e) return [];
      const params = { name: c.name, version: c.version, from: e.from, before: e.before, license: e.license, fork: e.fork ?? "", source: e.source };
      return [{ file: c.source, key: e.fork ? "relicensed_fork" : "relicensed", params }];
    });
    if (findings.length) return warn(msg("found", { count: findings.length }), capped(findings));
    return pass(msg("none", { count: production.length, events: EVENTS.length }));
  },
});

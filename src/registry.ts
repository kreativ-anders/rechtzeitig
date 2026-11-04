import { loadYaml } from "./data.ts";
import { normalize } from "./text.ts";
import type { Vendor } from "./sdk.ts";
import { LANGUAGES } from "./rules.ts";

export interface Registry {
  vendor(host: string): Vendor | undefined;
  trackingCookie(name: string): Vendor | undefined;
}

export function loadRegistry(): Registry {
  const entries = loadYaml<Array<Vendor & { cookies?: string[] }>>("data/third-parties.yml");
  for (const e of entries) {
    const missing = e.advice && LANGUAGES.filter((l) => typeof e.advice?.[l] !== "string" || !e.advice[l].trim());
    if (missing?.length) throw new Error(`data/third-parties.yml: advice of ${e.name} needs ${missing.join(", ")}`);
  }
  const vendors = entries.map((e) => ({
    ...e,
    names: (e.names ?? [e.name]).map(normalize),
    cookieRules: (e.cookies ?? []).map((c) => new RegExp(c)),
  }));
  return {
    vendor: (host) => {
      const h = host.toLowerCase();
      return vendors.find((v) => v.hosts.some((vh) => h === vh || h.endsWith(`.${vh}`)));
    },
    trackingCookie: (name) => vendors.find((v) => v.cookieRules.some((re) => re.test(name))),
  };
}

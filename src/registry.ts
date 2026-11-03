import { loadYaml } from "./data.ts";
import { normalize } from "./text.ts";
import type { Vendor } from "./sdk.ts";

export interface Registry {
  vendors: Vendor[];
  vendor(host: string): Vendor | undefined;
  trackingCookie(name: string): Vendor | undefined;
}

export function loadRegistry(): Registry {
  const entries = loadYaml<Array<Vendor & { cookies?: string[] }>>("data/third-parties.yml");
  const vendors = entries.map((e) => ({
    ...e,
    names: (e.names ?? [e.name]).map(normalize),
    cookieRules: (e.cookies ?? []).map((c) => new RegExp(c)),
  }));
  return {
    vendors,
    vendor: (host) => {
      const h = host.toLowerCase();
      return vendors.find((v) => v.hosts.some((vh) => h === vh || h.endsWith(`.${vh}`)));
    },
    trackingCookie: (name) => vendors.find((v) => v.cookieRules.some((re) => re.test(name))),
  };
}

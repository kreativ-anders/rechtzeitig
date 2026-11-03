import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { normalize } from "./text.ts";
import type { Vendor } from "./sdk.ts";

const FILE = new URL("../data/third-parties.yml", import.meta.url);

export interface Registry {
  vendors: Vendor[];
  vendor(host: string): Vendor | undefined;
  trackingCookie(name: string): Vendor | undefined;
}

export function loadRegistry(): Registry {
  const entries = parse(readFileSync(FILE, "utf8")) as Array<Vendor & { cookies?: string[] }>;
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

// One small parser per lockfile. Each returns components without purl; purl() adds it.

import { parse as parseYaml } from "yaml";
import type { Component, Ecosystem } from "../sdk.ts";

type Parsed = Omit<Component, "purl" | "source">;
type Parser = (text: string) => Parsed[];

/** Lockfile name → parser. A new ecosystem is one entry here plus purl() below. */
export const LOCKFILES: Record<string, Parser> = {
  "package-lock.json": npmLock,
  "pnpm-lock.yaml": pnpmLock,
  "yarn.lock": yarnLock,
  "composer.lock": composerLock,
  "pubspec.lock": pubspecLock,
  "Cargo.lock": (t) => tomlPackages(t, "cargo"),
  "uv.lock": (t) => tomlPackages(t, "pypi"),
  "poetry.lock": (t) => tomlPackages(t, "pypi"),
  "requirements.txt": requirements,
  "go.mod": goMod,
};

/** Manifests that should come with a lockfile. */
export const MANIFESTS: Record<string, string[]> = {
  "package.json": ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"],
  "composer.json": ["composer.lock"],
  "pubspec.yaml": ["pubspec.lock"],
  "Cargo.toml": ["Cargo.lock"],
  "pyproject.toml": ["uv.lock", "poetry.lock", "requirements.txt", "pdm.lock"],
};

export function purl(c: { ecosystem: Ecosystem; name: string; version: string }): string {
  const v = encodeURIComponent(c.version);
  switch (c.ecosystem) {
    case "npm":
      return `pkg:npm/${c.name.replace(/^@/, "%40")}@${v}`;
    case "pypi":
      return `pkg:pypi/${c.name.toLowerCase().replace(/[._]/g, "-")}@${v}`;
    case "go":
      return `pkg:golang/${c.name}@${v}`;
    default:
      return `pkg:${c.ecosystem}/${c.name}@${v}`;
  }
}

function npmLock(text: string): Parsed[] {
  const lock = JSON.parse(text);
  const out: Parsed[] = [];
  for (const [path, p] of Object.entries<any>(lock.packages ?? {})) {
    if (!path || p.link || !p.version) continue;
    const license = typeof p.license === "string" ? p.license : p.license?.type;
    out.push({ ecosystem: "npm", name: p.name ?? path.split("node_modules/").pop(), version: p.version, license, dev: !!(p.dev || p.devOptional) });
  }
  if (!lock.packages) {
    // lockfileVersion 1
    const walk = (deps: Record<string, any> = {}) => {
      for (const [name, d] of Object.entries(deps)) {
        out.push({ ecosystem: "npm", name, version: d.version, dev: !!d.dev });
        walk(d.dependencies);
      }
    };
    walk(lock.dependencies);
  }
  return out;
}

function pnpmLock(text: string): Parsed[] {
  const lock = parseYaml(text) ?? {};
  return Object.entries<any>(lock.packages ?? {}).flatMap(([key, p]) => {
    const spec = key.replace(/^\//, "").replace(/\(.*$/, "");
    const at = spec.lastIndexOf("@");
    if (at <= 0) return [];
    return [{ ecosystem: "npm" as const, name: spec.slice(0, at), version: spec.slice(at + 1), license: p?.license, dev: p?.dev === true }];
  });
}

function yarnLock(text: string): Parsed[] {
  const out: Parsed[] = [];
  let name = "";
  for (const line of text.split("\n")) {
    if (/^\S.*:$/.test(line) && !line.startsWith("__metadata")) {
      const spec = line.replace(/:$/, "").split(",")[0].trim().replace(/^"|"$/g, "");
      name = spec.slice(0, spec.indexOf("@", 1));
    }
    const version = /^\s+version:?\s+"?([^"\s]+)"?/.exec(line)?.[1];
    if (name && version && !version.includes("use.local")) {
      out.push({ ecosystem: "npm", name, version, dev: false });
      name = "";
    }
  }
  return out;
}

function composerLock(text: string): Parsed[] {
  const lock = JSON.parse(text);
  const map = (list: any[] = [], dev: boolean) =>
    list.map((p) => ({ ecosystem: "composer" as const, name: p.name, version: String(p.version).replace(/^v/, ""), license: p.license?.join(" OR "), dev }));
  return [...map(lock.packages, false), ...map(lock["packages-dev"], true)];
}

function pubspecLock(text: string): Parsed[] {
  const lock = parseYaml(text) ?? {};
  return Object.entries<any>(lock.packages ?? {})
    .filter(([, p]) => p.source === "hosted" || p.source === "git")
    .map(([name, p]) => ({ ecosystem: "pub" as const, name, version: String(p.version), dev: p.dependency === "direct dev" }));
}

// Cargo.lock, uv.lock and poetry.lock share the [[package]] layout.
function tomlPackages(text: string, ecosystem: "cargo" | "pypi"): Parsed[] {
  return text.split(/^\[\[package\]\]$/m).slice(1).flatMap((block) => {
    const field = (key: string) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(block)?.[1];
    const name = field("name");
    const version = field("version");
    if (!name || !version) return [];
    // Local workspace members are not dependencies.
    if (ecosystem === "cargo" && !/^source\s*=/m.test(block)) return [];
    if (/^source\s*=\s*\{\s*(editable|virtual)\s*=/m.test(block)) return [];
    return [{ ecosystem, name, version, dev: field("category") === "dev" }];
  });
}

function requirements(text: string): Parsed[] {
  return text.split("\n").flatMap((line) => {
    const m = /^\s*([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*==\s*([^\s;#]+)/.exec(line);
    return m ? [{ ecosystem: "pypi" as const, name: m[1], version: m[3], dev: false }] : [];
  });
}

function goMod(text: string): Parsed[] {
  const block = /^require\s*\(([\s\S]*?)^\)/m.exec(text)?.[1] ?? "";
  const single = [...text.matchAll(/^require\s+(\S+)\s+(\S+)/gm)].map((m) => `${m[1]} ${m[2]}`);
  return [...block.split("\n"), ...single].flatMap((line) => {
    const m = /^\s*(\S+)\s+(v\S+)/.exec(line);
    return m ? [{ ecosystem: "go" as const, name: m[1], version: m[2], dev: false }] : [];
  });
}

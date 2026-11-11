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

/** Parser for a file path: its name in LOCKFILES, and requirements*.txt as requirements.txt. */
export function parserFor(path: string): Parser | undefined {
  const name = path.split("/").pop() ?? "";
  if (/^requirements.*\.txt$/.test(name)) return requirements;
  return Object.hasOwn(LOCKFILES, name) ? LOCKFILES[name] : undefined;
}

/** Manifest name → lockfiles that lock it. go.mod pins exact versions itself. */
export const MANIFESTS: Record<string, string[]> = {
  "package.json": ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"],
  "composer.json": ["composer.lock"],
  "pubspec.yaml": ["pubspec.lock"],
  "Cargo.toml": ["Cargo.lock"],
  "pyproject.toml": ["uv.lock", "poetry.lock", "requirements.txt", "pdm.lock"],
  "go.mod": ["go.mod"],
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

// Raw lockfile shapes, only the fields read here.
interface NpmPackage { name?: string; version?: string; license?: string | { type?: string }; dev?: boolean; devOptional?: boolean; link?: boolean }
interface NpmV1Dependency { version: string; dev?: boolean; dependencies?: Record<string, NpmV1Dependency> }
interface NpmLock { packages?: Record<string, NpmPackage>; dependencies?: Record<string, NpmV1Dependency> }

/** A non-empty string from a parsed file, or undefined: lockfiles are untrusted and may hold any type. */
function str(value: unknown): string | undefined {
  return (typeof value === "string" && value) || (typeof value === "number" && Number.isFinite(value) && String(value)) || undefined;
}

function npmLock(source: string): Parsed[] {
  const lock = (JSON.parse(source) ?? {}) as NpmLock;
  const out: Parsed[] = [];
  for (const [path, p] of Object.entries(lock.packages ?? {})) {
    if (!path || p?.link || !str(p?.version)) continue;
    const name = str(p.name) ?? path.split("node_modules/").pop();
    if (!name) continue;
    const license = str(p.license) ?? str((p.license as { type?: unknown } | undefined)?.type);
    out.push({ ecosystem: "npm", name, version: str(p.version)!, license, dev: !!(p.dev || p.devOptional) });
  }
  if (!lock.packages) {
    // lockfileVersion 1
    const walk = (deps: Record<string, NpmV1Dependency> = {}) => {
      for (const [name, d] of Object.entries(deps ?? {})) {
        const version = str(d?.version);
        if (version) out.push({ ecosystem: "npm", name, version, dev: !!d.dev });
        walk(d?.dependencies);
      }
    };
    walk(lock.dependencies);
  }
  return out;
}

type PnpmRefs = Record<string, string | { version: string }>;
interface PnpmDeps { dependencies?: PnpmRefs; optionalDependencies?: PnpmRefs; devDependencies?: PnpmRefs }
interface PnpmPackage { name?: string; version?: string; license?: string; dev?: boolean }
interface PnpmLock { lockfileVersion?: string | number; importers?: Record<string, PnpmDeps>; packages?: Record<string, PnpmPackage>; snapshots?: Record<string, PnpmDeps> }

/**
 * v5 keys: /name/1.2.3_peer. v6: /name@1.2.3(peer). v9: name@1.2.3, with the dependency graph in
 * `snapshots` and no dev flag, so dev is what production importers do not reach.
 */
function pnpmLock(text: string): Parsed[] {
  const lock = (parseYaml(text) ?? {}) as PnpmLock;
  const v5 = String(lock.lockfileVersion ?? "").startsWith("5");
  const prod = lock.snapshots ? pnpmReachable(lock) : undefined;
  return Object.entries(lock.packages ?? {}).flatMap(([key, p]) => {
    const spec = v5 ? pnpmV5Spec(key) : pnpmSpec(key);
    const name = str(p?.name) ?? spec?.name;
    const version = str(p?.version) ?? spec?.version;
    if (!name || !version) return [];
    const dev = prod ? !prod.has(`${name}@${version}`) : p?.dev === true;
    return [{ ecosystem: "npm" as const, name, version, license: str(p?.license), dev }];
  });
}

function pnpmSpec(key: string): { name: string; version: string } | undefined {
  const spec = key.replace(/^\//, "").replace(/\(.*$/, "");
  const at = spec.lastIndexOf("@");
  return at > 0 ? { name: spec.slice(0, at), version: spec.slice(at + 1) } : undefined;
}

function pnpmV5Spec(key: string): { name: string; version: string } | undefined {
  const m = /^\/((?:@[^/]+\/)?[^/@]+)\/([^/_]+)/.exec(key);
  return m ? { name: m[1], version: m[2] } : undefined;
}

/** "name@version" of every package that a production dependency of an importer reaches. */
function pnpmReachable(lock: PnpmLock): Set<string> {
  const ref = (name: string, r: string | { version: string }) => {
    const v = typeof r === "string" ? r : str(r?.version) ?? "";
    // An alias points at another package: "string-width@4.2.3".
    return v.replace(/\(.*$/, "").lastIndexOf("@") > 0 ? v : `${name}@${v}`;
  };
  const prodRefs = (d: PnpmDeps | undefined) => Object.entries({ ...d?.dependencies, ...d?.optionalDependencies }).map(([n, r]) => ref(n, r));
  const queue = Object.values(lock.importers ?? {}).flatMap(prodRefs);
  const seen = new Set<string>();
  while (queue.length) {
    const key = queue.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...prodRefs(lock.snapshots?.[key]));
  }
  return new Set([...seen].map((k) => k.replace(/\(.*$/, "")));
}

/**
 * Yarn classic and Berry. An entry header lists descriptors ("alias@npm:lodash@^4", lodash@^4.17.0);
 * the package name comes from Berry's `resolution`, else from an `npm:` alias target, else from the
 * first descriptor. Other protocols (file:, link:, git URLs) keep the name before their "@".
 */
function yarnLock(text: string): Parsed[] {
  const out: Parsed[] = [];
  let entry: { descriptors: string[]; version?: string; resolution?: string } | undefined;
  const flush = () => {
    const name = entry && yarnName(entry.descriptors, entry.resolution);
    if (name && entry?.version && !entry.version.includes("use.local")) out.push({ ecosystem: "npm", name, version: entry.version, dev: false });
    entry = undefined;
  };
  for (const line of text.split("\n")) {
    if (/^\S.*:$/.test(line) && !line.startsWith("#")) {
      flush();
      if (!line.startsWith("__metadata")) entry = { descriptors: line.slice(0, -1).split(",").map((d) => d.trim().replace(/^"|"$/g, "")) };
      continue;
    }
    if (!entry) continue;
    entry.version ??= /^ {2}version:?\s+"?([^"\s]+)"?/.exec(line)?.[1];
    entry.resolution ??= /^ {2}resolution:\s+"?([^"\s]+)"?/.exec(line)?.[1];
  }
  flush();
  return out;
}

/** "name@range" or "@scope/name@range" split at the "@" that ends the name. */
function splitIdent(spec: string): [string, string] | undefined {
  const at = spec.indexOf("@", 1);
  return at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : undefined;
}

const NPM_NAME = /^(?:@[\w.~-]+\/)?[\w.~-]+$/;

function yarnName(descriptors: string[], resolution: string | undefined): string | undefined {
  // Berry: resolution: "lodash@npm:4.17.20" names the package, also for aliases.
  if (resolution) return splitIdent(resolution)?.[0];
  for (const d of descriptors) {
    const range = splitIdent(d)?.[1];
    if (!range?.startsWith("npm:")) continue;
    // Classic alias: npm:lodash@4.17.20, npm:@scope/pkg@1.0.0 or npm:lodash. A bare range (Berry's npm:^4) keeps the name.
    const target = range.slice(4);
    const inner = splitIdent(target)?.[0];
    if (inner) return inner;
    if (NPM_NAME.test(target) && !/^\d/.test(target)) return target;
  }
  return splitIdent(descriptors[0] ?? "")?.[0];
}

interface ComposerPackage { name: string; version: string | number; license?: string[] }

function composerLock(source: string): Parsed[] {
  const lock = (JSON.parse(source) ?? {}) as { packages?: ComposerPackage[]; "packages-dev"?: ComposerPackage[] };
  const map = (list: ComposerPackage[] = [], dev: boolean) =>
    (Array.isArray(list) ? list : []).flatMap((p) => {
      const name = str(p?.name);
      const version = str(p?.version)?.replace(/^v/, "");
      if (!name || !version) return [];
      const license = Array.isArray(p.license) ? p.license.filter((l) => typeof l === "string").join(" OR ") || undefined : undefined;
      return [{ ecosystem: "composer" as const, name, version, license, dev }];
    });
  return [...map(lock.packages, false), ...map(lock["packages-dev"], true)];
}

interface PubspecPackage { source?: string; version?: string; dependency?: string }

function pubspecLock(source: string): Parsed[] {
  const lock = (parseYaml(source) ?? {}) as { packages?: Record<string, PubspecPackage> };
  return Object.entries(lock.packages ?? {}).flatMap(([name, p]) => {
    const version = str(p?.version);
    if (!version || (p.source !== "hosted" && p.source !== "git")) return [];
    return [{ ecosystem: "pub" as const, name, version, dev: p.dependency === "direct dev" }];
  });
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
  // Text after each "require (" up to the closing ")" line. Split instead of a lazy regex: linear on any input.
  const blocks = text.split(/^require[ \t]*\(/m).slice(1).flatMap((b) => b.split("\n)")[0].split("\n"));
  const single = [...text.matchAll(/^require[ \t]+(\S+)[ \t]+(\S+)/gm)].map((m) => `${m[1]} ${m[2]}`);
  return [...blocks, ...single].flatMap((line) => {
    const m = /^\s*(\S+)\s+(v\S+)/.exec(line);
    return m ? [{ ecosystem: "go" as const, name: m[1], version: m[2], dev: false }] : [];
  });
}

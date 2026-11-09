// Direct dependencies as package manifests declare them, and the lockfile that locks each manifest.
// Small readers per format, no TOML library: only the tables and keys named below are read.

import { parse as parseYaml } from "yaml";
import { loadYaml } from "../data.ts";
import type { Ecosystem, RepoContext } from "../sdk.ts";

const DATA = loadYaml<{ python_lockfiles: string[]; composer_platform: string; npm_non_registry: string }>("data/packages.yml");
const COMPOSER_PLATFORM = new RegExp(DATA.composer_platform, "i");
const NPM_NON_REGISTRY = new RegExp(DATA.npm_non_registry);

export interface Declared {
  manifest: string;
  line?: number;
  ecosystem: Ecosystem;
  /** As the registry knows it; PyPI names normalized (PEP 503). */
  name: string;
  /** Version requirement as written, empty when the manifest gives none. */
  spec: string;
  dev: boolean;
  /** registry: resolved from the public registry. git, local (path, workspace, file) and other (URL, alias) are not. */
  kind: "registry" | "git" | "local" | "other";
}

/** Manifest file names this module reads. */
export const DECLARING = ["package.json", "composer.json", "pubspec.yaml", "Cargo.toml", "pyproject.toml"] as const;

/** PEP 503 normalized name. */
export const pypiName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path: string) => path.split("/").pop() ?? "";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 1-based line of the first match, or undefined. */
function lineOf(text: string, re: RegExp): number | undefined {
  const i = text.split("\n").findIndex((l) => re.test(l));
  return i >= 0 ? i + 1 : undefined;
}

/** Direct dependencies of one manifest. Empty when it cannot be read or parsed. */
export function declaredDependencies(repo: RepoContext, manifest: string): Declared[] {
  const text = repo.read(manifest);
  if (!text) return [];
  try {
    switch (baseOf(manifest)) {
      case "package.json":
        return npmDeclared(manifest, text);
      case "composer.json":
        return composerDeclared(manifest, text);
      case "pubspec.yaml":
        return pubDeclared(manifest, text);
      case "Cargo.toml":
        return cargoDeclared(manifest, text);
      case "pyproject.toml":
        return pyprojectDeclared(manifest, text);
    }
  } catch {
    // Not valid JSON or YAML: nothing declared that can be compared.
  }
  return [];
}

function npmDeclared(manifest: string, text: string): Declared[] {
  const pkg = JSON.parse(text) as Record<string, unknown>;
  const out: Declared[] = [];
  for (const [field, dev] of [["dependencies", false], ["devDependencies", true], ["optionalDependencies", false]] as const) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, raw] of Object.entries(deps as Record<string, unknown>)) {
      const spec = typeof raw === "string" ? raw.trim() : "";
      const kind = /^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/.test(spec) || (/^[^@\s/][^\s]*\/[^\s]+$/.test(spec) && !/^https?:/.test(spec))
        ? "git"
        : /^(workspace:|file:|link:|portal:|\.|\/|~\/)/.test(spec) ? "local" : NPM_NON_REGISTRY.test(spec) && !spec.startsWith("catalog:") ? "other" : "registry";
      out.push({ manifest, line: lineOf(text, new RegExp(`"${escape(name)}"\\s*:`)), ecosystem: "npm", name, spec, dev, kind });
    }
  }
  return out;
}

function composerDeclared(manifest: string, text: string): Declared[] {
  const pkg = JSON.parse(text) as Record<string, unknown>;
  const out: Declared[] = [];
  for (const [field, dev] of [["require", false], ["require-dev", true]] as const) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, raw] of Object.entries(deps as Record<string, unknown>)) {
      if (COMPOSER_PLATFORM.test(name) || !name.includes("/")) continue;
      out.push({ manifest, line: lineOf(text, new RegExp(`"${escape(name)}"\\s*:`)), ecosystem: "composer", name: name.toLowerCase(), spec: String(raw), dev, kind: "registry" });
    }
  }
  return out;
}

function pubDeclared(manifest: string, text: string): Declared[] {
  const doc = (parseYaml(text) ?? {}) as Record<string, unknown>;
  const out: Declared[] = [];
  for (const [field, dev] of [["dependencies", false], ["dev_dependencies", true]] as const) {
    const deps = doc[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, raw] of Object.entries(deps as Record<string, unknown>)) {
      const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
      if (o?.sdk !== undefined) continue; // flutter, flutter_test: part of the SDK, not a package
      const kind = o?.path !== undefined ? "local" : o?.git !== undefined ? "git" : "registry";
      const spec = typeof raw === "string" ? raw : typeof o?.version === "string" ? o.version : "";
      out.push({ manifest, line: lineOf(text, new RegExp(`^\\s+${escape(name)}\\s*:`)), ecosystem: "pub", name, spec, dev, kind });
    }
  }
  return out;
}

/** Quoted value of `key = "..."` inside an inline table. */
const inlineField = (table: string, key: string) => new RegExp(`(?:^|[{,\\s])${key}\\s*=\\s*"([^"]*)"`).exec(table)?.[1];

function cargoDeclared(manifest: string, text: string): Declared[] {
  const out: Declared[] = [];
  const lines = text.split("\n");
  // [dependencies], [dev-dependencies], [build-dependencies], also under [target.'cfg(..)'.…].
  const SECTION = /^\[(?:target\..+\.)?(dev-|build-)?dependencies\]\s*(#.*)?$/;
  // [dependencies.name] with its keys on the following lines.
  const TABLE = /^\[(?:target\..+\.)?(dev-|build-)?dependencies\.("?)([A-Za-z0-9_-]+)\2\]\s*(#.*)?$/;
  let section: { dev: boolean } | undefined;
  let table: { name: string; dev: boolean; line: number; body: string } | undefined;
  const flush = () => {
    if (table) out.push(cargoDep(manifest, table.name, table.body, table.dev, table.line));
    table = undefined;
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("[")) {
      flush();
      section = undefined;
      const s = SECTION.exec(line);
      const t = TABLE.exec(line);
      if (s) section = { dev: s[1] === "dev-" };
      else if (t) table = { name: t[3], dev: t[1] === "dev-", line: i + 1, body: "" };
      return;
    }
    if (table) {
      table.body += ` ${line}`;
      return;
    }
    if (!section) return;
    const m = /^("?)([A-Za-z0-9_-]+)\1\s*=\s*(.+)$/.exec(line);
    if (m) out.push(cargoDep(manifest, m[2], m[3], section.dev, i + 1));
  });
  flush();
  return out;
}

function cargoDep(manifest: string, key: string, value: string, dev: boolean, line: number): Declared {
  const plain = /^"([^"]*)"/.exec(value.trim())?.[1];
  const name = inlineField(value, "package") ?? key;
  const kind = /(^|[{,\s])path\s*=/.test(value) ? "local" : /(^|[{,\s])git\s*=/.test(value) ? "git" : "registry";
  return { manifest, line, ecosystem: "cargo", name, spec: plain ?? inlineField(value, "version") ?? "", dev, kind };
}

/**
 * Strings of the TOML array that starts at `text[start]` ("["), and the index after its "]".
 * Comments and nested arrays are skipped; inline tables ({ include-group = ... }) give no string.
 */
function tomlArray(text: string, start: number): { items: string[]; end: number } {
  const items: string[] = [];
  let depth = 0;
  let braces = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "#") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
    } else if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close < 0) break;
      if (braces === 0 && depth === 1) items.push(text.slice(i + 1, close));
      i = close;
    } else if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return { items, end: i + 1 };
  }
  return { items, end: text.length };
}

/** A PEP 508 requirement: name, version part, and whether it points at a URL instead of the index. */
function pep508(req: string): { name: string; spec: string; url: boolean } | undefined {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(.*)$/.exec(req);
  if (!m) return undefined;
  const rest = m[3].split(";")[0].trim();
  return { name: pypiName(m[1]), spec: rest, url: rest.startsWith("@") };
}

function pyprojectDeclared(manifest: string, text: string): Declared[] {
  const out: Declared[] = [];
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const add = (req: string, dev: boolean, index: number) => {
    const r = pep508(req);
    if (r) out.push({ manifest, line: lineAt(index), ecosystem: "pypi", name: r.name, spec: r.url ? "" : r.spec, dev, kind: r.url ? "other" : "registry" });
  };
  // Table headers with their positions, so a key can be matched to the table it stands in.
  const headers = [...text.matchAll(/^\[([^\]\n]+)\]\s*$/gm)].map((m) => ({ name: m[1].trim(), at: m.index ?? 0 }));
  const tableAt = (index: number) => headers.filter((h) => h.at < index).pop()?.name ?? "";

  // PEP 621 and PEP 735 arrays, and uv's dev-dependencies.
  for (const m of text.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*\[/gm)) {
    const table = tableAt(m.index ?? 0);
    const key = m[1];
    const pep621 = table === "project" && key === "dependencies";
    const extras = table === "project.optional-dependencies";
    const groups = table === "dependency-groups";
    const uvDev = table === "tool.uv" && key === "dev-dependencies";
    if (!pep621 && !extras && !groups && !uvDev) continue;
    const open = (m.index ?? 0) + m[0].length - 1;
    const { items } = tomlArray(text, open);
    let at = open;
    for (const item of items) {
      at = text.indexOf(item, at);
      add(item, groups || uvDev, at);
    }
  }
  // Poetry: name = "^1.0" or name = { version = ..., path = ..., git = ... }.
  for (const m of text.matchAll(/^("?)([A-Za-z0-9][A-Za-z0-9._-]*)\1\s*=\s*(.+)$/gm)) {
    const table = tableAt(m.index ?? 0);
    const main = table === "tool.poetry.dependencies";
    const dev = table === "tool.poetry.dev-dependencies" || /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(table);
    if ((!main && !dev) || m[2].toLowerCase() === "python") continue;
    const value = m[3];
    const kind = /(^|[{,\s])path\s*=/.test(value) ? "local" : /(^|[{,\s])(git|url)\s*=/.test(value) ? (/(^|[{,\s])git\s*=/.test(value) ? "git" : "other") : "registry";
    const spec = /^"([^"]*)"/.exec(value.trim())?.[1] ?? inlineField(value, "version") ?? "";
    out.push({ manifest, line: lineAt(m.index ?? 0), ecosystem: "pypi", name: pypiName(m[2]), spec, dev, kind });
  }
  return out;
}

/** Name a manifest gives its own package (workspace member names), or undefined. */
export function ownName(repo: RepoContext, manifest: string): string | undefined {
  const text = repo.read(manifest) ?? "";
  try {
    switch (baseOf(manifest)) {
      case "package.json":
      case "composer.json":
        return (JSON.parse(text) as { name?: unknown }).name as string | undefined;
      case "pubspec.yaml":
        return (parseYaml(text) as { name?: string } | undefined)?.name;
      case "Cargo.toml":
        return /^\[package\][^[]*?^name\s*=\s*"([^"]+)"/ms.exec(text)?.[1];
      case "pyproject.toml": {
        const name = /^\[(project|tool\.poetry)\][^[]*?^name\s*=\s*"([^"]+)"/ms.exec(text)?.[2];
        return name && pypiName(name);
      }
    }
  } catch {
    // unreadable manifest
  }
  return undefined;
}

/** Lockfile names per manifest, as this module compares them. */
const LOCKS: Record<string, string[]> = {
  "package.json": ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"],
  "composer.json": ["composer.lock"],
  "pubspec.yaml": ["pubspec.lock"],
  "Cargo.toml": ["Cargo.lock"],
  "pyproject.toml": DATA.python_lockfiles,
};

/**
 * Lockfiles that lock this manifest: in its own folder, or in a parent folder when that lockfile names the
 * manifest's folder (npm, pnpm and yarn workspaces) or its package (Cargo and uv workspaces). Only lockfiles
 * the scan parsed count; for the others nothing can be compared.
 */
export function lockfilesFor(repo: RepoContext, manifest: string): string[] {
  const locks = LOCKS[baseOf(manifest)] ?? [];
  const parsed = new Set(repo.coverage.lockfiles.parsed);
  const dir = dirOf(manifest);
  const own = locks.map((l) => (dir ? `${dir}/${l}` : l)).filter((p) => repo.files.includes(p));
  if (own.length) return own.filter((p) => parsed.has(p));
  const name = ownName(repo, manifest);
  for (let d = dir; d; ) {
    d = dirOf(d);
    const found = locks.map((l) => (d ? `${d}/${l}` : l)).filter((p) => repo.files.includes(p));
    if (!found.length) continue;
    const rel = d ? dir.slice(d.length + 1) : dir;
    const member = found.filter((p) => {
      const text = repo.read(p) ?? "";
      if (/\.(json|yaml|lock)$/.test(p) && !/(Cargo|uv|poetry)\.lock$/.test(p)) return text.includes(rel);
      return !!name && text.includes(`name = "${name}"`);
    });
    return member.filter((p) => parsed.has(p));
  }
  return [];
}

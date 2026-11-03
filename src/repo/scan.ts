// Reads the repository the workflow runs in: tracked files, lockfiles, project license, OSV vulnerabilities.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { LOCKFILES, purl } from "./lockfiles.ts";
import { queryOsv } from "./osv.ts";
import type { Component, RepoContext } from "../sdk.ts";

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".next", "target"]);
const MAX_FILE = 1_000_000;

export interface RepoOptions {
  /** Query OSV for vulnerabilities. Off in tests. */
  osv?: boolean;
}

/** Returns undefined when the folder has no files (for example, no actions/checkout step). */
export async function scanRepo(root: string, opts: RepoOptions = {}): Promise<RepoContext | undefined> {
  const files = listFiles(root);
  if (!files.length) return undefined;
  const cache = new Map<string, string | undefined>();
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, readText(join(root, path)));
    return cache.get(path);
  };

  const components: Component[] = [];
  const lockfiles: string[] = [];
  for (const file of files) {
    const name = /^requirements.*\.txt$/.test(basename(file)) ? "requirements.txt" : basename(file);
    const parser = Object.hasOwn(LOCKFILES, name) ? LOCKFILES[name] : undefined;
    const text = parser && read(file);
    if (!parser || !text) continue;
    try {
      components.push(...parser(text).map((c) => ({ ...c, purl: purl(c), source: file })));
      lockfiles.push(file);
    } catch {
      // unreadable lockfile; the sbom check reports manifests without a readable lockfile
    }
  }

  const unique = [...new Map(components.map((c) => [`${c.purl}|${c.source}`, c])).values()];
  const { vulnerabilities, status } = opts.osv === false ? { vulnerabilities: [], status: "skipped" } : await queryOsv(unique);
  return { root, files, read, license: projectLicense(read), components: unique, lockfiles, vulnerabilities, osv: status };
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (existsSync(join(root, ".git"))) {
    try {
      return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64_000_000 }).split("\0").filter(Boolean);
    } catch {
      // fall back to walking the folder
    }
  }
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      else if (entry.isFile()) out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

function readText(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_FILE) return undefined;
    const buf = readFileSync(path);
    return buf.includes(0) ? undefined : buf.toString("utf8");
  } catch {
    return undefined;
  }
}

function projectLicense(read: (p: string) => string | undefined): string {
  for (const manifest of ["package.json", "composer.json"]) {
    try {
      const license = JSON.parse(read(manifest) ?? "").license;
      if (license) return Array.isArray(license) ? license.join(" OR ") : String(license);
    } catch {
      // no manifest or invalid JSON
    }
  }
  const text = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"].map(read).find(Boolean) ?? "";
  const head = text.slice(0, 3000);
  const extra = /commons clause/i.test(text) ? " WITH Commons-Clause" : "";
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(head)) return `AGPL-3.0${extra}`;
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(head)) return `LGPL${extra}`;
  if (/GNU GENERAL PUBLIC LICENSE/i.test(head)) return `${/Version 2/i.test(head) ? "GPL-2.0" : "GPL-3.0"}${extra}`;
  if (/Apache License/i.test(head)) return "Apache-2.0";
  if (/Mozilla Public License/i.test(head)) return "MPL-2.0";
  if (/Permission is hereby granted, free of charge/i.test(head)) return "MIT";
  if (/Redistribution and use in source and binary forms/i.test(head)) return "BSD";
  if (/Permission to use, copy, modify, and\/or distribute/i.test(head)) return "ISC";
  return text ? "unknown" : "";
}

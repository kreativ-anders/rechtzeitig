// Reads the repository the workflow runs in: tracked files, lockfiles, project license, OSV vulnerabilities,
// and what it could not see or read (RepoCoverage).

import { execFileSync } from "node:child_process";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadYaml } from "../data.ts";
import { errorMessage } from "../text.ts";
import { gitmodulePaths, privateSources, unsupportedFiles } from "./coverage.ts";
import { detectLicenseText, hasCommonsClause } from "./licenses.ts";
import { parserFor, purl } from "./lockfiles.ts";
import { queryOsv } from "./osv.ts";
import { componentRef } from "./sbom.ts";
import type { Component, RepoContext, RepoCoverage, UnreadReason } from "../sdk.ts";

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".next", "target"]);
const LIMITS = loadYaml<{ repo: { max_file_bytes: number; max_lockfile_bytes: number; cache_bytes: number } }>("data/thresholds.yml").repo;
const LFS_POINTER = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\n/;

export interface RepoOptions {
  /** Query OSV for vulnerabilities. Off in tests. */
  osv?: boolean;
  /** Tests only: override data/thresholds.yml repo.cache_bytes. */
  cacheBytes?: number;
}

/** What the first pass keeps per file: never the text, so many sub-limit files cannot build a large heap. */
type Read = { skipped: Exclude<UnreadReason, "invalid" | "lfs"> } | { ok: true; size: number; lfs: boolean } | undefined;

/** Returns undefined when the folder has no files (for example, no actions/checkout step). */
export async function scanRepo(path: string, opts: RepoOptions = {}): Promise<RepoContext | undefined> {
  const root = resolve(path);
  const listing = listFiles(root);
  const files = listing.files;
  if (!files.length) return undefined;
  const cacheBytes = opts.cacheBytes ?? LIMITS.cache_bytes;
  const cache = new Map<string, Read>();
  // LRU over file texts, bounded by repo.cache_bytes (data/thresholds.yml); an evicted file is re-read on demand.
  const texts = new Map<string, string>();
  let textChars = 0;
  const limitOf = (path: string) => (parserFor(path) ? LIMITS.max_lockfile_bytes : LIMITS.max_file_bytes);
  const load = (path: string) => {
    if (!cache.has(path)) {
      const r = readText(join(root, path), limitOf(path));
      if (!r) cache.set(path, undefined);
      else if ("skipped" in r) cache.set(path, { skipped: r.skipped });
      else cache.set(path, { ok: true, size: r.text.length, lfs: LFS_POINTER.test(r.text) });
    }
    return cache.get(path);
  };
  const read = (path: string) => {
    const r = load(path);
    if (!r || !("ok" in r)) return undefined;
    const kept = texts.get(path);
    if (kept !== undefined) {
      texts.delete(path);
      texts.set(path, kept); // most recently used last
      return kept;
    }
    const fresh = readText(join(root, path), limitOf(path));
    if (!fresh || "skipped" in fresh) return undefined;
    texts.set(path, fresh.text);
    textChars += fresh.text.length;
    while (textChars > cacheBytes && texts.size > 1) {
      const oldest = texts.keys().next().value!;
      textChars -= texts.get(oldest)!.length;
      texts.delete(oldest);
    }
    return fresh.text;
  };

  // Every file once, so the report can say what was not read. Checks read through the LRU cache above.
  const large: string[] = [];
  const binary: string[] = [];
  const lfs: string[] = [];
  for (const file of files) {
    const r = load(file);
    if (r && "skipped" in r) (r.skipped === "large" ? large : binary).push(file);
    else if (r && r.lfs) lfs.push(file);
  }

  const lfsSet = new Set(lfs);
  const components: Component[] = [];
  const lockfiles: string[] = [];
  const locks: RepoCoverage["lockfiles"] = { parsed: [], empty: [], failed: [] };
  for (const file of files) {
    const parser = parserFor(file);
    if (!parser) continue;
    const r = load(file);
    if (!r) continue;
    if ("skipped" in r) {
      locks.failed.push({ file, reason: r.skipped });
      continue;
    }
    if (lfsSet.has(file)) {
      locks.failed.push({ file, reason: "lfs" });
      continue;
    }
    const text = read(file);
    if (text === undefined) continue;
    try {
      const found = parser(text).map((c) => ({ ...c, purl: purl(c), source: file }));
      components.push(...found);
      lockfiles.push(file);
      (found.length ? locks.parsed : locks.empty).push(file);
    } catch {
      locks.failed.push({ file, reason: "invalid" });
    }
  }

  const coverage: RepoCoverage = {
    listing: listing.walked === undefined ? "git" : "walk",
    ...(listing.walked === undefined ? {} : { walked: listing.walked }),
    submodules: submodules(root, files, listing.gitlinks, read),
    lfs,
    large,
    binary,
    lockfiles: locks,
    unsupported: unsupportedFiles(files),
    private: privateSources(files, read),
  };

  const unique = [...new Map(components.map((c) => [componentRef(c), c])).values()];
  const { vulnerabilities, status } = opts.osv === false ? { vulnerabilities: [], status: "skipped" } : await queryOsv(unique);
  const find = (pattern: RegExp) => files.filter((f) => pattern.test(f));
  const yaml = <T>(path: string): T | undefined => {
    const text = read(path);
    try {
      return text === undefined ? undefined : ((parseYaml(text) ?? undefined) as T | undefined);
    } catch {
      return undefined;
    }
  };
  return { root, files, read, find, yaml, license: projectLicense(read), components: unique, lockfiles, coverage, vulnerabilities, osv: status };
}

/** Submodules from .gitmodules and from gitlinks git lists without content. Checked out when files below them were listed. */
function submodules(root: string, files: string[], gitlinks: string[], read: (p: string) => string | undefined): RepoCoverage["submodules"] {
  const paths = [...new Set([...gitmodulePaths(files, read), ...gitlinks])].sort();
  return paths.map((path) => ({ path, checkedOut: !gitlinks.includes(path) && files.some((f) => f.startsWith(`${path}/`)) && existsSync(join(root, path)) }));
}

interface Listing {
  files: string[];
  /** Submodule paths git lists as a gitlink only: not checked out. */
  gitlinks: string[];
  /** Why the folder was walked instead of asking git; undefined when git listed the files. */
  walked?: string;
}

// No fsmonitor and no system config: the scanned repository must not make git run programs.
// -c settings also reach the git processes started for submodules.
const git = (root: string, args: string[]) =>
  execFileSync("git", ["-c", "core.fsmonitor=false", "-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

/** Regular files only: a symlink could point outside the repository or at a device that never ends. */
function listFiles(root: string): Listing {
  if (!existsSync(root)) return { files: [], gitlinks: [] };
  let walked = "no .git folder";
  if (existsSync(join(root, ".git"))) {
    try {
      const own = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0");
      // A second call for submodules: --recurse-submodules works only with --cached or --stage.
      // --stage shows the mode, so a submodule that is not checked out shows as gitlink (160000).
      let staged: string[] = [];
      try {
        staged = git(root, ["ls-files", "-z", "--stage", "--recurse-submodules"]).split("\0");
      } catch {
        // an old git or a broken submodule: the own files are still there
      }
      const gitlinks = staged.filter((l) => l.startsWith("160000 ")).map((l) => l.slice(l.indexOf("\t") + 1));
      const nested = staged.filter((l) => l && !l.startsWith("160000 ")).map((l) => l.slice(l.indexOf("\t") + 1));
      const files = [...new Set([...own, ...nested])].filter((f) => f && isRegularFile(join(root, f))).sort();
      return { files, gitlinks };
    } catch (e) {
      walked = `git ls-files failed: ${errorMessage(e)}`;
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
  return { files: out.sort(), gitlinks: [], walked };
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** Reads at most `max` bytes of a regular file. Larger and binary files say why they were skipped; symlinks, devices and errors give undefined. */
function readText(path: string, max: number): { text: string } | { skipped: Exclude<UnreadReason, "invalid" | "lfs"> } | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) return undefined;
    if (stat.size > max) return { skipped: "large" };
    const buf = Buffer.alloc(stat.size + 1); // one byte more shows a file that grew
    let size = 0;
    for (let n = 1; n > 0 && size < buf.length; size += n) n = readSync(fd, buf, size, buf.length - size, null);
    if (size > max) return { skipped: "large" };
    if (buf.subarray(0, size).includes(0)) return { skipped: "binary" };
    return { text: buf.toString("utf8", 0, size) };
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
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
  const family = detectLicenseText(text);
  const extra = hasCommonsClause(text) ? " WITH Commons-Clause" : "";
  if (family) return `${family}${extra}`;
  return text ? "unknown" : "";
}

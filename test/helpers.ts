// Test helpers for checks. A check test serves one fixture folder on localhost,
// scans it with the real crawler and runs the check on the result.

import { after } from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { launchBrowser, scan, type ScanOptions } from "../src/scan.ts";
import { emptySnapshot } from "../src/capture.ts";
import { createContext } from "../src/context.ts";
import type { CrawlData } from "../src/crawl.ts";
import { loadLanguages } from "../src/lang.ts";
import { loadRegistry } from "../src/registry.ts";
import { scanRepo } from "../src/repo/scan.ts";
import { importCheck } from "../src/runner.ts";
import { render, renderFinding } from "../src/messages.ts";
import { LANGUAGES } from "../src/rules.ts";
import type { Check, Page, RepoCheck, RepoContext, Result, ScanContext, Snapshot } from "../src/sdk.ts";

const CHECKS = fileURLToPath(new URL("../checks/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * Serves a folder. "/about" finds about.html or about/index.html.
 * An optional _headers.json in the folder adds response headers to every document,
 * an optional _static-headers.json to every other file. Files are sent as stored, with their Content-Length,
 * so a fixture can hold gzipped files and set Content-Encoding in the JSON.
 */
export async function serve(dir: string): Promise<{ url: string; close: () => void }> {
  const json = (name: string) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), "utf8")) : {});
  const extra = json("_headers.json");
  const staticExtra = json("_static-headers.json");
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
      const file = resolve(dir, `.${candidate}`);
      if (file.startsWith(resolve(dir)) && existsSync(file) && statSync(file).isFile()) {
        const type = TYPES[extname(file)] ?? "application/octet-stream";
        const body = readFileSync(file);
        res.writeHead(200, { "content-type": type, "content-length": body.length, ...(type.startsWith("text/html") ? extra : staticExtra) });
        res.end(body);
        return;
      }
    }
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<h1>Not found</h1>");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

/**
 * Chrome for tests: with its sandbox where the machine has one, otherwise without. The tests check detection;
 * whether a runner has a sandbox is checked by the self-scan (dev/roadmap.md), and the action itself stays strict.
 */
export const testBrowser = () => launchBrowser(undefined, true);

let browser: Promise<Browser> | undefined;
after(async () => (await browser)?.close());

/** Scans a fixture folder. Requests to other hosts are recorded, then blocked. */
export async function scanFixture(dir: string, opts: ScanOptions = {}): Promise<ScanContext> {
  browser ??= testBrowser();
  const site = await serve(dir);
  try {
    return await scan(site.url, { offline: true, browser: await browser, timeout: 10_000, ...opts });
  } finally {
    site.close();
  }
}

/** A result as the English report shows it, plus the raw result. */
export interface Rendered {
  status: Result["status"];
  message: string;
  details: string[];
  raw: Result;
}

/**
 * Renders a result in every report language, so a missing message key fails the test, and returns the English one.
 * `checkDir` is the folder of the check; its path below checks/ is the message group.
 */
export function rendered(checkDir: string, raw: Result): Rendered {
  const scope = relative(CHECKS, checkDir).split(sep).join("/");
  const inLang = (lang: string) => ({
    message: render(raw.message, scope, lang),
    details: (raw.details ?? []).map((d) => renderFinding(d, scope, lang)),
  });
  for (const lang of LANGUAGES) inLang(lang);
  return { status: raw.status, ...inLang("en"), raw };
}

/** Runs checks/<…>/check.ts in `checkDir` against checkDir/fixtures/<fixture>. */
export async function runCheck(checkDir: string, fixture: string, opts: ScanOptions = {}): Promise<Rendered> {
  const check = await importCheck<Check>(join(checkDir, "check.ts"));
  const ctx = await scanFixture(join(checkDir, "fixtures", fixture), opts);
  return rendered(checkDir, await check.run(ctx));
}

/** Runs checks/<…>/check.ts in `checkDir` against fakeContext(start, extra). */
export async function runFake(checkDir: string, start: Partial<Snapshot> = {}, extra: Partial<CrawlData> = {}): Promise<Rendered> {
  const check = await importCheck<Check>(join(checkDir, "check.ts"));
  return rendered(checkDir, await check.run(fakeContext(start, extra)));
}

/** Builds a context by hand, for cases a local fixture cannot show (https, redirects). */
export function fakeContext(start: Partial<Snapshot>, extra: Partial<CrawlData> = {}): ScanContext {
  const snapshot: Snapshot = { ...emptySnapshot("https://example.de/"), status: 200, lang: "de", ...start };
  const page: Page = { url: snapshot.finalUrl, noJs: snapshot, js: snapshot };
  const data = { url: snapshot.finalUrl, start: page, pages: [page], probes: [], countries: {}, ...extra };
  return createContext(data, loadLanguages(["de"]), loadRegistry(), {
    languages: ["de"],
    subscriptions: false,
    sales: false,
  });
}

/** Writes the files to a temporary folder and scans it as a repository (without OSV). */
export async function repoFromFiles(files: Record<string, string>): Promise<RepoContext> {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-repo-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const repo = await scanRepo(root, { osv: false });
  if (!repo) throw new Error("repoFromFiles needs at least one file");
  return repo;
}

/** Runs the repository check (defineRepoCheck) in `checkDir` against a repository made of `files`. */
export async function runRepoCheck(checkDir: string, files: Record<string, string>, extra: Partial<RepoContext> = {}): Promise<Rendered> {
  const check = await importCheck<RepoCheck>(join(checkDir, "check.ts"));
  return rendered(checkDir, await check.run({ ...(await repoFromFiles(files)), ...extra }));
}

/** package-lock.json text: package name → version, or → { version, license, dev }. */
export function npmLock(pkgs: Record<string, string | { version: string; license?: string; dev?: boolean }>): string {
  const packages = Object.fromEntries(Object.entries(pkgs).map(([name, p]) => [`node_modules/${name}`, typeof p === "string" ? { version: p } : p]));
  return JSON.stringify({ lockfileVersion: 3, packages: { "": {}, ...packages } });
}

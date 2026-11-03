// Test helpers for checks. A check test serves one fixture folder on localhost,
// scans it with the real crawler and runs the check on the result.

import { after } from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { launchBrowser, scan, type ScanOptions } from "../src/scan.ts";
import { createContext } from "../src/context.ts";
import type { CrawlData } from "../src/crawl.ts";
import { loadLanguages } from "../src/lang.ts";
import { loadRegistry } from "../src/registry.ts";
import { scanRepo } from "../src/repo/scan.ts";
import type { Check, Page, RepoCheck, RepoContext, Result, ScanContext, Snapshot } from "../src/sdk.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
};

/**
 * Serves a folder. "/about" finds about.html or about/index.html.
 * An optional _headers.json in the folder adds response headers to every document.
 */
export async function serve(dir: string): Promise<{ url: string; close: () => void }> {
  const headersFile = join(dir, "_headers.json");
  const extra = existsSync(headersFile) ? JSON.parse(readFileSync(headersFile, "utf8")) : {};
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
      const file = resolve(dir, `.${candidate}`);
      if (file.startsWith(resolve(dir)) && existsSync(file) && statSync(file).isFile()) {
        const type = TYPES[extname(file)] ?? "application/octet-stream";
        res.writeHead(200, { "content-type": type, ...(type.startsWith("text/html") ? extra : {}) });
        res.end(readFileSync(file));
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

let browser: Promise<Browser> | undefined;
after(async () => (await browser)?.close());

/** Scans a fixture folder. Requests to other hosts are recorded, then blocked. */
export async function scanFixture(dir: string, opts: ScanOptions = {}): Promise<ScanContext> {
  browser ??= launchBrowser();
  const site = await serve(dir);
  try {
    return await scan(site.url, { offline: true, browser: await browser, timeout: 10_000, ...opts });
  } finally {
    site.close();
  }
}

/** Runs checks/<…>/check.ts in `checkDir` against checkDir/fixtures/<fixture>. */
export async function runCheck(checkDir: string, fixture: string, opts: ScanOptions = {}): Promise<Result> {
  const check = (await import(pathToFileURL(join(checkDir, "check.ts")).href)).default as Check;
  const ctx = await scanFixture(join(checkDir, "fixtures", fixture), opts);
  return check.run(ctx);
}

/** Builds a context by hand, for cases a local fixture cannot show (https, redirects). */
export function fakeContext(start: Partial<Snapshot>, extra: Partial<CrawlData> = {}): ScanContext {
  const snapshot: Snapshot = {
    status: 200, finalUrl: "https://example.de/", headers: {}, meta: {}, lang: "de", text: "",
    links: [], forms: [], checkboxes: [], requests: [], cookies: [], storage: [], ...start,
  };
  const page: Page = { url: snapshot.finalUrl, noJs: snapshot, js: snapshot };
  const data = { start: page, pages: [page], probes: [], countries: {}, ...extra };
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

/** Runs checks/repo/<name>/check.ts in `checkDir` against a repository made of `files`. */
export async function runRepoCheck(checkDir: string, files: Record<string, string>, extra: Partial<RepoContext> = {}): Promise<Result> {
  const check = (await import(pathToFileURL(join(checkDir, "check.ts")).href)).default as RepoCheck;
  return check.run({ ...(await repoFromFiles(files)), ...extra });
}

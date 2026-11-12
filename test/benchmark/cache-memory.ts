// Measures the retained memory of scanRepo() on a repository with many files below the per-file limit
// (issue #47): the first pass reads every file once into the cache and keeps the text for the whole run.
//
//   node --expose-gc test/benchmark/cache-memory.ts [fileCount] [fileBytes]
//
// Not part of npm test (no .test.ts); run it by hand and put the numbers in the PR.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../../src/repo/scan.ts";

const mb = (n: number) => Math.round(n / 1_048_576);
const mem = (label: string) => {
  (globalThis as { gc?: () => void }).gc?.();
  const m = process.memoryUsage();
  console.log(`${label}: heapUsed ${mb(m.heapUsed)} MB, rss ${mb(m.rss)} MB`);
  return m;
};

const count = Number(process.argv[2] ?? 20_000);
const size = Number(process.argv[3] ?? 50_000);

const root = mkdtempSync(join(tmpdir(), "rechtzeitig-cache-"));
console.log(`generating ${count} files of ${size} bytes in ${root}`);
const chunk = "const x = 1; // ".repeat(Math.ceil(size / 16)).slice(0, size);
for (let i = 0; i < count; i++) {
  const dir = join(root, `d${i % 100}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `f${i}.ts`), chunk);
}

mem("before scanRepo");
const started = Date.now();
const repo = await scanRepo(root, { osv: false });
mem(`after scanRepo (${Date.now() - started} ms, cache filled)`);
console.log(`files listed: ${repo?.files.length}, sample read: ${repo?.read("d0/f0.ts")?.length} chars`);
mem("after gc");

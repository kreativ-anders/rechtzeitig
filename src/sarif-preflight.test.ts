// The check before the SARIF upload: which runs skip it, and that every unclear answer still tries the upload.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, sarifMode } from "./sarif-preflight.ts";

const BASE = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "owner/site", GITHUB_API_URL: "https://api.example", GITHUB_TOKEN: "t", GITHUB_EVENT_NAME: "schedule", GITHUB_ACTOR: "owner" };

/** A fetch that answers with this status and body and records the requests. */
function answer(status: number, body = "") {
  const calls: { url: string; auth?: string }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string>)?.authorization });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;

function withEvent(event: object, run: (path: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-sarif-"));
  const path = join(dir, "event.json");
  writeFileSync(path, JSON.stringify(event));
  return run(path).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("empty sarif-upload counts as auto; unknown values are rejected", () => {
  assert.equal(sarifMode(""), "auto");
  assert.equal(sarifMode(undefined), "auto");
  assert.equal(sarifMode("true"), "true");
  assert.equal(sarifMode("false"), "false");
  assert.equal(sarifMode("yes"), undefined);
});

test("uploads when code scanning answers, also before the first analysis (404)", async () => {
  for (const status of [200, 404]) {
    const { fetcher, calls } = answer(status);
    assert.equal((await decide(BASE, fetcher)).upload, true);
    assert.deepEqual(calls, [{ url: "https://api.example/repos/owner/site/code-scanning/analyses?per_page=1", auth: "Bearer t" }]);
  }
});

test("skips without code scanning (private repository without GitHub Code Security)", async () => {
  const body = JSON.stringify({ message: "Code Security must be enabled for this repository to use code scanning." });
  const d = await decide(BASE, answer(403, body).fetcher);
  assert.deepEqual([d.upload, d.reason], [false, "no-code-security"]);
  assert.match(d.note, /GitHub Code Security/);
  const old = await decide(BASE, answer(403, '{"message":"Advanced Security must be enabled for this repository to use code scanning."}').fetcher);
  assert.equal(old.reason, "no-code-security");
});

test("skips when the token may not use code scanning", async () => {
  const d = await decide(BASE, answer(403, '{"message":"Resource not accessible by integration"}').fetcher);
  assert.deepEqual([d.upload, d.reason], [false, "permission"]);
  assert.match(d.note, /security-events: write/);
});

test("tries the upload when the answer is unclear", async () => {
  assert.equal((await decide(BASE, offline)).upload, true);
  assert.equal((await decide(BASE, answer(500).fetcher)).upload, true);
});

test("skips without a request outside GitHub, for Dependabot and for pull requests from forks", async () => {
  assert.equal((await decide({}, offline)).reason, "local");
  assert.equal((await decide({ ...BASE, GITHUB_ACTOR: "dependabot[bot]" }, offline)).reason, "dependabot");
  assert.equal((await decide({ ...BASE, GITHUB_TRIGGERING_ACTOR: "dependabot[bot]" }, offline)).reason, "dependabot");
  await withEvent({ pull_request: { head: { repo: { full_name: "someone/site" } } } }, async (path) => {
    const env = { ...BASE, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path };
    assert.equal((await decide(env, offline)).reason, "fork");
  });
  await withEvent({ pull_request: { head: { repo: null } } }, async (path) => {
    assert.equal((await decide({ ...BASE, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path }, offline)).reason, "fork");
  });
});

test("a pull request from a branch of the same repository asks code scanning", async () => {
  await withEvent({ pull_request: { head: { repo: { full_name: "owner/site" } } } }, async (path) => {
    const { fetcher, calls } = answer(200);
    assert.equal((await decide({ ...BASE, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path }, fetcher)).upload, true);
    assert.equal(calls.length, 1);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for a plain 404 page", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails when an error page shows a stack trace", async () => {
  const result = await runCheck(here, "stack-trace");
  assert.equal(result.status, "fail");
  assert.ok(result.details?.some((d) => d.includes("/var/www/html/index.php")));
});

test("ignores links, scripts and prose that only look like errors", async () => {
  assert.equal((await runCheck(here, "prose")).status, "pass");
});

test("warns for version headers", async () => {
  const result = await runCheck(here, "version-header");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["x-powered-by: PHP/8.2.1"]);
});

test("leaves no tag in the finding text, even from nested tags", async () => {
  const result = await runCheck(here, "nested-tags");
  assert.equal(result.status, "fail");
  assert.ok(result.details?.length);
  assert.ok(result.details.every((d) => !/[<>]/.test(d)));
});

test("flags a server header only with a version number", async () => {
  assert.equal((await runCheck(here, "server-name")).status, "pass");
  const result = await runCheck(here, "server-version");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["server: nginx/1.25.3"]);
});

const errorPage = (body: string) => runFake(here, {}, { probes: [{ path: "/x", kind: "error", status: 500, headers: {}, body, exposed: false }] });

test("each leak pattern in data/leaks.yml is found on its own", async () => {
  const samples = [
    "Fatal error: Allowed memory size exhausted", "Stack trace: #0 {main}", "Traceback (most recent call last): File app.py",
    "Uncaught TypeError: x is undefined", "Warning: Division by zero in calc on line 12", "SQLSTATE[42S02]: Base table not found",
    "Whoops! There was an error.", "Werkzeug Debugger", "at Object.run (/app/server.js:10:5)", "File /home/deploy/app.py missing",
  ];
  for (const body of samples) {
    const result = await errorPage(`<h1>Error</h1><p>${body}</p>`);
    assert.equal(result.status, "fail", body);
    assert.equal(result.details.length, 1, body);
  }
});

test("ignores errors inside scripts and styles, in any case", async () => {
  assert.equal((await errorPage("<SCRIPT>var e = 'Fatal error: x'</SCRIPT><p>Not found</p>")).status, "pass");
  assert.equal((await errorPage("<style>/* Fatal error: x */</style><p>Not found</p>")).status, "pass");
});

test("warns for every version header in data/leaks.yml", async () => {
  for (const header of ["x-aspnet-version", "x-aspnetmvc-version", "x-generator"]) {
    assert.equal((await runFake(here, { headers: { [header]: "4.0" } })).status, "warn", header);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const layout = '<head>\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">\n</head>';

test("fails with the repository line that loads Google Fonts", async () => {
  const result = await runCrossCheck(here, "loads", { "src/layout.html": layout });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["src/layout.html:2: loads Google Fonts", "/"]);
});

test("fails and says the deployed site differs when the repository already self-hosts", async () => {
  const result = await runCrossCheck(here, "loads", { "package.json": '{"dependencies":{"@fontsource/inter":"5"}}', "app/layout.tsx": 'import { Inter } from "next/font/google";' });
  assert.equal(result.status, "fail");
  assert.match(result.message, /no template, style or code in the repository names them/);
  assert.match(result.details.join("\n"), /Already installed for self-hosting: @fontsource\/inter, next\/font\/google/);
});

test("ignores Markdown, data files and CSP lines that only allow the hosts", async () => {
  const files = {
    "README.md": "We do not use fonts.googleapis.com.",
    "data/hosts.yml": "- fonts.gstatic.com",
    "next.config.js": "const csp = \"font-src 'self' https://fonts.gstatic.com\";",
  };
  assert.equal((await runCrossCheck(here, "clean", files)).status, "pass");
});

test("gives info when the code loads Google Fonts but the visited pages did not", async () => {
  const result = await runCrossCheck(here, "clean", { "src/blog.css": '@import url("https://fonts.googleapis.com/css2?family=Lora");' });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["src/blog.css:1: loads Google Fonts"]);
});

test("passes when neither the site nor the repository loads Google Fonts", async () => {
  assert.equal((await runCrossCheck(here, "clean", { "src/app.css": "body { font-family: Inter; }" })).status, "pass");
});

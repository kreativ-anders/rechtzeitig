import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const vite = () => siteFromFiles({ "index.html": '<html><head><script type="module" src="/@vite/client"></script></head><body>Hi</body></html>', "@vite/client": "export {};" });
const clean = () => siteFromFiles({ "index.html": '<html><head><script src="/app.js"></script></head><body>Hi</body></html>', "app.js": "console.log(1);" });

test("fails when the site runs the Vite dev server and the Dockerfile starts it", async () => {
  const result = await runCrossCheck(here, await vite(), { Dockerfile: "FROM node:24\nRUN npm install vite\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\"]\n" });
  assert.equal(result.status, "fail");
  assert.match(result.details.join("\n"), /Vite dev server on the site/);
  assert.match(result.details.join("\n"), /Dockerfile:3: Starts a development server/);
  assert.doesNotMatch(result.details.join("\n"), /Dockerfile:2/);
});

test("warns when the site runs a dev build but the repository starts production", async () => {
  const result = await runCrossCheck(here, await vite(), { "package.json": '{"scripts":{"start":"vite preview","dev":"vite"}}' });
  assert.equal(result.status, "warn");
});

test("gives info for a deploy file with a dev command, and ignores dev Dockerfiles and start scripts alone", async () => {
  assert.equal((await runCrossCheck(here, await clean(), { Procfile: "web: python manage.py runserver 0.0.0.0:$PORT" })).status, "info");
  const quiet = { "Dockerfile.dev": "CMD npm run dev", "package.json": '{"scripts":{"start":"vite"}}', "settings.py": "DEBUG = True" };
  assert.equal((await runCrossCheck(here, await clean(), quiet)).status, "pass");
});

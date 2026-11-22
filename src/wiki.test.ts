// The pages of the wiki written by hand stay true to the code: links resolve, every page is in the sidebar,
// "Data and safety" names every outside service (CLAUDE.md, "Boundaries"), and no page names a removed input.
// The generated pages come from npm run docs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml } from "./data.ts";
import { SWITCHES } from "./rules.ts";
import { anchor, readWiki, wikiPages } from "../test/wiki.ts";

const pages = wikiPages();
const names = new Set(pages.map((f) => f.replace(/\.md$/, "")));
const headings = (page: string) => new Set([...readWiki(`${page}.md`).matchAll(/^#+ (.+)$/gm)].map((m) => anchor(m[1])));

test("every link between wiki pages reaches a page and a heading", () => {
  const broken = pages.flatMap((file) =>
    [...readWiki(file).matchAll(/\]\(([A-Z][\w-]*)(?:#([\w-]+))?\)/g)]
      .filter(([, page, id]) => !names.has(page) || (id && !headings(page).has(id)))
      .map(([link]) => `${file}: ${link}`));
  assert.deepEqual(broken, []);
});

test("the sidebar links every page", () => {
  const sidebar = readWiki("_Sidebar.md");
  assert.deepEqual([...names].filter((n) => !n.startsWith("_") && !sidebar.includes(`](${n})`)), []);
});

test("Data and safety names every outside service", () => {
  const page = readWiki("Data-and-safety.md");
  const services = Object.values(SWITCHES).flatMap((s) => ("service" in s && s.service ? [s.service] : []));
  assert.deepEqual(services.filter((s) => !page.includes(s)), []);
});

// Keys of workflow steps, permissions and data files that pages show as `key: value`; every other key is an input.
const NOT_INPUTS = new Set(["actions", "contents", "security-events", "persist-credentials", "submodules", "lfs", "continue-on-error", "if", "secret", "consent", "purpose"]);

test("every `key: value` on a wiki page names an input of the action", () => {
  const inputs = new Set(Object.keys(loadYaml<{ inputs: Record<string, unknown> }>("action.yml").inputs));
  const unknown = pages.flatMap((file) =>
    [...readWiki(file).matchAll(/`([a-z][a-z-]*): [^`]+`/g)]
      .filter(([, key]) => !inputs.has(key) && !NOT_INPUTS.has(key))
      .map(([snippet]) => `${file}: ${snippet}`));
  assert.deepEqual(unknown, []);
});

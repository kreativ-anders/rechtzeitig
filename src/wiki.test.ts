// The pages of the wiki written by hand stay true to the code: links resolve, every page is in the sidebar,
// and "Data and safety" names every outside service (CLAUDE.md, "Boundaries"). The generated pages come from npm run docs.

import { test } from "node:test";
import assert from "node:assert/strict";
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

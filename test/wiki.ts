// The local clone of the wiki for the tests. npm run docs clones it into wiki/; CI clones it before the tests.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { WIKI_DIR } from "../src/docs.ts";

/** File names of all wiki pages. Fails with what to run when there is no clone. */
export function wikiPages(): string[] {
  if (!existsSync(WIKI_DIR)) throw new Error("wiki/ is missing: run npm run docs, which clones the wiki");
  return readdirSync(WIKI_DIR).filter((f) => f.endsWith(".md"));
}

export const readWiki = (file: string) => readFileSync(new URL(file, WIKI_DIR), "utf8");

/** The id GitHub gives a heading: lowercase, punctuation dropped, spaces as hyphens. */
export const anchor = (heading: string) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");

// Refreshes data/public-suffixes.dat from the Public Suffix List (MPL-2.0), ICANN and private sections.
// The list is kept unmodified below a short header, in its own file, as its license asks.
//
//   npm run refresh-suffixes

import { writeFileSync } from "node:fs";

const SOURCE = "https://publicsuffix.org/list/public_suffix_list.dat";
const TARGET = new URL("../data/public-suffixes.dat", import.meta.url);

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
const list = await res.text();
if (!list.includes("===BEGIN PRIVATE DOMAINS===") || !list.includes("===END ICANN DOMAINS===")) {
  throw new Error(`${SOURCE}: not the Public Suffix List`);
}

const today = new Date().toISOString().slice(0, 10);
const header = [
  "// Public Suffix List, copied unmodified below this header by dev/public-suffixes.ts.",
  `// Source: ${SOURCE}`,
  "// License: Mozilla Public License 2.0 (MPL-2.0), https://mozilla.org/MPL/2.0/",
  `// Retrieved: ${today}`,
  "// Used by siteOf() in src/text.ts to decide which hosts belong to the same site.",
  "",
  "",
].join("\n");

writeFileSync(TARGET, header + list);
console.log(`data/public-suffixes.dat: ${list.split("\n").filter((l) => l.trim() && !l.startsWith("//")).length} rules, ${today}`);

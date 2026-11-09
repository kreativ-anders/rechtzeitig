// Every pattern from data/ and lang/ runs on text from the scanned site or repository.
// None may take long on hostile input (catastrophic backtracking).

import { test } from "node:test";
import assert from "node:assert/strict";
import { availableLanguages, loadLanguages } from "./lang.ts";
import { loadYaml } from "./data.ts";
import { cpuMs } from "../test/helpers.ts";

const data = (file: string) => loadYaml<Array<Record<string, string>>>(`data/${file}`);
// Loading also compiles every language pattern; an invalid one throws here.
const all = loadLanguages(availableLanguages());
const patterns: Array<[string, RegExp]> = [
  ...data("secrets.yml").map((r): [string, RegExp] => [`secrets.yml ${r.name}`, new RegExp(r.pattern)]),
  ...loadYaml<{ patterns: string[] }>("data/leaks.yml").patterns.map((p): [string, RegExp] => [`leaks.yml ${p}`, new RegExp(p)]),
  ...Object.entries(loadYaml<Record<string, string[]>>("data/cookies.yml"))
    .flatMap(([group, list]) => list.map((p): [string, RegExp] => [`cookies.yml ${group}`, new RegExp(p, "i")])),
  ...loadYaml<{ odr: string[] }>("data/outdated-links.yml").odr.map((p): [string, RegExp] => [`outdated-links.yml ${p}`, new RegExp(p, "i")]),
  ...Object.entries(loadYaml<Record<string, string[]>>("data/licenses.yml"))
    .flatMap(([group, list]) => list.map((p): [string, RegExp] => [`licenses.yml ${group}`, new RegExp(p, "i")])),
  ...Object.entries(loadYaml<Record<string, string[]>>("data/shop.yml"))
    .flatMap(([group, list]) => list.map((p): [string, RegExp] => [`shop.yml ${group}`, new RegExp(p, "i")])),
  ["update-tools.yml renovate", new RegExp(loadYaml<{ renovate: string }>("data/update-tools.yml").renovate)],
  ...data("probes.yml").filter((p) => p.expect).map((p): [string, RegExp] => [`probes.yml ${p.path}`, new RegExp(p.expect, "m")]),
  ...Object.entries({ ...all.links, ...all.text })
    .flatMap(([concept, res]) => res.map((re): [string, RegExp] => [`lang ${concept}`, re])),
];
const N = 50_000;
const inputs = ["\n", " ", "\t\n", "a ", "A", "0", "aaa ", "_", "-"].map((s) => s.repeat(N / s.length) + "!");

test("data and language patterns stay fast on hostile input", async () => {
  for (const [name, re] of patterns) {
    for (const input of inputs) {
      const ms = await cpuMs(() => re.test(input));
      assert.ok(ms < 200, `${name} takes ${Math.round(ms)} ms CPU on ${JSON.stringify(input.slice(0, 4))}…`);
    }
  }
});

/**
 * 100 KB near misses built from a pattern's own words: the words over and over (for "(\w+ ){0,3}" and
 * ".*" between them), and its first word followed by a long run, as in "sk-ant-AAAA…" without the end.
 */
function nearMisses(re: RegExp): string[] {
  const words = re.source.replace(/\\[a-zA-Z]/g, " ").match(/[a-zA-Z0-9]{2,}/g) ?? [];
  if (!words.length) return [];
  const fill = (unit: string) => unit.repeat(Math.ceil(100_000 / unit.length)) + "!";
  return [fill(`${words.join(" ")} `), fill(`${words.join("-")}-`), `${words[0]}-${fill("A")}`, `${words[0]}_${fill("a1")}`, `${words[0]} ${fill("x ")}`];
}

test("data and language patterns stay fast on near misses made of their own words", async () => {
  for (const [name, re] of patterns) {
    for (const input of nearMisses(re)) {
      const ms = await cpuMs(() => re.test(input));
      assert.ok(ms < 200, `${name} takes ${Math.round(ms)} ms CPU on ${JSON.stringify(input.slice(0, 30))}…`);
    }
  }
});

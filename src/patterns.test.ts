// Every pattern from data/ and lang/ runs on text from the scanned site or repository.
// None may take long on hostile input (catastrophic backtracking).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { availableLanguages, loadLanguages } from "./lang.ts";
import { loadYaml } from "./data.ts";

const data = (file: string) => parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8")) as Array<Record<string, string>>;
const patterns: Array<[string, RegExp]> = [
  ...data("secrets.yml").map((r): [string, RegExp] => [`secrets.yml ${r.name}`, new RegExp(r.pattern)]),
  ...loadYaml<{ patterns: string[] }>("data/leaks.yml").patterns.map((p): [string, RegExp] => [`leaks.yml ${p}`, new RegExp(p)]),
  ...Object.entries(loadYaml<Record<string, string[]>>("data/cookies.yml"))
    .flatMap(([group, list]) => list.map((p): [string, RegExp] => [`cookies.yml ${group}`, new RegExp(p, "i")])),
  ...loadYaml<{ odr: string[] }>("data/outdated-links.yml").odr.map((p): [string, RegExp] => [`outdated-links.yml ${p}`, new RegExp(p, "i")]),
  ...data("probes.yml").filter((p) => p.expect).map((p): [string, RegExp] => [`probes.yml ${p.path}`, new RegExp(p.expect, "m")]),
  ...Object.entries({ ...loadLanguages(availableLanguages()).links, ...loadLanguages(availableLanguages()).text })
    .flatMap(([concept, res]) => res.map((re): [string, RegExp] => [`lang ${concept}`, re])),
];
const N = 50_000;
const inputs = ["\n", " ", "\t\n", "a ", "A", "0", "aaa ", "_", "-"].map((s) => s.repeat(N / s.length) + "!");

test("data and language patterns stay fast on hostile input", () => {
  for (const [name, re] of patterns) {
    for (const input of inputs) {
      const started = Date.now();
      re.test(input);
      assert.ok(Date.now() - started < 200, `${name} is slow on ${JSON.stringify(input.slice(0, 4))}…`);
    }
  }
});

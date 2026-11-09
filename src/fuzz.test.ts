// Property tests for the paths that read untrusted input: text from scanned pages and files in the
// repository. Inputs come from a seeded generator, so a failure repeats; the seed is in the message.

import { test } from "node:test";
import assert from "node:assert/strict";
import { oneLine } from "./text.ts";
import { LOCKFILES } from "./repo/lockfiles.ts";
import { cpuMs } from "../test/helpers.ts";

/** Small seeded generator (mulberry32). */
function random(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, pick: <T>(list: readonly T[]) => list[int(list.length)] };
}

// Characters that break one-line output: controls, line and paragraph separators, bidi overrides,
// plus surrogate pairs, combining marks and plain text around them.
const PIECES = ["\n", "\r\n", "\t", "\u0000", "\u001b[31m", "\u007f", "\u0085", "\u2028", "\u2029", "\u202e", "\u2066", "\u2069",
  "😀", "👩\u200d💻", "é", " ", "  ", "a", "Impressum", "<b>", "&amp;", "\\", "\ufeff", "\ud800"];
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/;
// A high surrogate at the end means a character was cut in half.
const HALF = /[\ud800-\udbff]$/;

test("oneLine: one line, capped, idempotent, never half a character", () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const r = random(seed);
    const text = Array.from({ length: r.int(400) }, () => r.pick(PIECES)).join("");
    const max = r.pick([1, 2, 3, 10, 80, 300]);
    const out = oneLine(text, max);
    const why = `seed ${seed}, max ${max}`;
    assert.doesNotMatch(out, CONTROL, why);
    assert.ok(out.length <= max, why);
    assert.equal(out, out.trim(), why);
    assert.equal(oneLine(out, max), out, why);
    if (!text.includes("\ud800")) assert.doesNotMatch(out.replace(/…$/, ""), HALF, why);
  }
});

test("oneLine: 10 MB of control characters stays fast", async () => {
  const text = "\u0000\n\u202e".repeat(3_500_000);
  let out = "";
  assert.ok((await cpuMs(() => (out = oneLine(text)))) < 1000);
  assert.equal(out, "");
});

// One valid file per parser, the base for truncation and corruption.
const SAMPLES: Record<string, string> = {
  "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/a": { version: "1.0.0", license: "MIT" }, "node_modules/@s/b": { version: "2.0.0", dev: true } } }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      a: { specifier: ^1, version: 1.0.0 }\npackages:\n  a@1.0.0: {}\n  '@s/b@2.0.0': {}\nsnapshots:\n  a@1.0.0:\n    dependencies:\n      '@s/b': 2.0.0\n",
  "yarn.lock": '"a@^1.0.0":\n  version "1.0.0"\n\n"@s/b@^2", "@s/b@^2.0.0":\n  version "2.0.0"\n',
  "composer.lock": JSON.stringify({ packages: [{ name: "a/b", version: "v1.0.0", license: ["MIT"] }], "packages-dev": [{ name: "c/d", version: "2.0.0" }] }),
  "pubspec.lock": 'packages:\n  http:\n    dependency: "direct main"\n    source: hosted\n    version: "1.2.0"\n  test:\n    dependency: "direct dev"\n    source: hosted\n    version: "1.0.0"\n',
  "Cargo.lock": '[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n\n[[package]]\nname = "local"\nversion = "0.1.0"\n',
  "uv.lock": '[[package]]\nname = "requests"\nversion = "2.31.0"\nsource = { registry = "https://pypi.org/simple" }\n',
  "poetry.lock": '[[package]]\nname = "requests"\nversion = "2.31.0"\ncategory = "main"\n',
  "requirements.txt": "requests==2.31.0\nflask[async]==3.0.0 ; python_version > '3.8'\n# comment\n",
  "go.mod": "module x\n\nrequire (\n\tgithub.com/a/b v1.2.3\n)\n\nrequire github.com/e/f v2.0.0\n",
};

// Values of the wrong type where a parser expects objects, strings or lists.
const ODD = [null, 0, -1, 1e308, true, "", "x", [], [null], {}, { version: null }, { version: 1 }, { name: [] }, "__proto__"];
function oddJson(r: ReturnType<typeof random>, depth = 0): unknown {
  if (depth > 3 || r.next() < 0.3) return r.pick(ODD);
  if (r.next() < 0.3) return Array.from({ length: r.int(3) }, () => oddJson(r, depth + 1));
  const keys = ["packages", "packages-dev", "dependencies", "node_modules/a", "version", "name", "license", "dev", "lockfileVersion", "importers", "snapshots", "source", "a@1.0.0", "", "__proto__", "constructor"];
  return Object.fromEntries(Array.from({ length: r.int(4) }, () => [r.pick(keys), oddJson(r, depth + 1)]));
}

/** Truncated, corrupted and wrongly typed variants of a sample. */
function variants(name: string, sample: string, seed: number): string[] {
  const r = random(seed);
  const out = ["", "\u0000", "\ufeff", "{", "[", "null", "[]", "{}", "\"\"", "0", "---\n- a", "a: [", "[[package]]", "require (", sample.repeat(3)];
  for (let cut = 0; cut < sample.length; cut += Math.max(1, Math.floor(sample.length / 40))) out.push(sample.slice(0, cut));
  for (let i = 0; i < 60; i++) {
    const chars = [...sample];
    for (let k = 0; k <= r.int(4); k++) chars[r.int(chars.length)] = r.pick(["\u0000", "\"", "{", "}", "[", "]", ":", "\n", "@", "=", " ", "(", ")", "😀"]);
    out.push(chars.join(""));
  }
  // JSON is YAML too, so the YAML parsers get the same wrongly typed trees.
  if (/\.json$|^pnpm-lock|^pubspec/.test(name)) {
    for (const odd of ODD) {
      out.push(JSON.stringify({ packages: { "a@1.0.0": { name: odd }, "node_modules/b": { version: odd }, c: { source: "hosted", version: odd } } }));
      out.push(JSON.stringify({ packages: { "a@1.0.0": { license: odd }, "node_modules/b": { version: "1.0.0", license: odd } } }));
      out.push(JSON.stringify({ packages: [{ name: odd, version: "1" }, { name: "a/b", version: odd, license: odd }] }));
      out.push(JSON.stringify({ importers: { ".": { dependencies: { a: odd } } }, packages: { "a@1.0.0": {} }, snapshots: { "a@1.0.0": odd } }));
    }
    for (let i = 0; i < 200; i++) out.push(JSON.stringify(oddJson(r)));
  }
  return out;
}

test("lockfile parsers: garbage gives components with a name and version, or an Error", async () => {
  let seed = 0;
  for (const [name, parse] of Object.entries(LOCKFILES)) {
    const sample = SAMPLES[name];
    assert.ok(sample, `no sample for ${name}`);
    assert.ok(parse(sample).length > 0, `${name}: the sample has components`);
    for (const input of variants(name, sample, ++seed)) {
      const why = `${name} on ${JSON.stringify(input.slice(0, 120))}`;
      let found: ReturnType<typeof parse> | undefined;
      const ms = await cpuMs(() => {
        try {
          found = parse(input);
        } catch (e) {
          // src/repo/scan.ts reports the file as invalid; anything but an Error would be a bug in a parser.
          assert.ok(e instanceof Error, why);
        }
      });
      assert.ok(ms < 200, `${why}: ${Math.round(ms)} ms`);
      for (const c of found ?? []) {
        assert.ok(typeof c.name === "string" && c.name.length > 0, `${why}: name ${JSON.stringify(c.name)}`);
        assert.ok(typeof c.version === "string" && c.version.length > 0 && c.version !== "undefined", `${why}: version ${JSON.stringify(c.version)}`);
        assert.ok(c.license === undefined || typeof c.license === "string", `${why}: license ${JSON.stringify(c.license)}`);
      }
    }
  }
});

test("lockfile parsers: deep nesting and 5 MB files stay fast", async () => {
  const deep = `${'{"dependencies":{"a":{"version":"1.0.0",'.repeat(5000)}"x":1${"}}}".repeat(5000)}`;
  const big: Record<string, string> = {
    "package-lock.json": deep,
    "yarn.lock": `${"a@1:\n".repeat(500_000)}`,
    "requirements.txt": `${"a".repeat(5_000_000)}==`,
    "Cargo.lock": `${"[[package]]\nname = \"".repeat(200_000)}`,
    "go.mod": `${"require ( ".repeat(500_000)}`,
  };
  for (const [name, text] of Object.entries(big)) {
    const ms = await cpuMs(() => {
      try {
        LOCKFILES[name](text);
      } catch (e) {
        assert.ok(e instanceof Error, name);
      }
    });
    assert.ok(ms < 2000, `${name}: ${Math.round(ms)} ms`);
  }
});

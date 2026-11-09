import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml } from "../data.ts";
import {
  choices, classify, compareVersions, dependencyLicenses, detectLicenseText, licenseChanges, normalizeLicenseText, parseSpdx, readLicense,
  spdxStatus, unavoidable,
} from "./licenses.ts";
import { npmLock, repoFromFiles } from "../../test/helpers.ts";

const ids = (expression: string) => choices(expression)?.map((alt) => alt.map((t) => (t.exception ? `${t.id} WITH ${t.exception}` : t.id)));

test("SPDX expressions: OR, AND, WITH and parentheses with the right precedence", () => {
  assert.deepEqual(ids("MIT"), [["MIT"]]);
  assert.deepEqual(ids("MIT OR Apache-2.0"), [["MIT"], ["Apache-2.0"]]);
  assert.deepEqual(ids("MIT AND BSD-3-Clause OR GPL-3.0-only"), [["MIT", "BSD-3-Clause"], ["GPL-3.0-only"]]);
  assert.deepEqual(ids("MIT AND (BSD-3-Clause OR GPL-3.0-only)"), [["MIT", "BSD-3-Clause"], ["MIT", "GPL-3.0-only"]]);
  assert.deepEqual(ids("(MIT OR ISC) AND (Apache-2.0 OR 0BSD)")?.length, 4);
  assert.deepEqual(ids("GPL-2.0-only WITH Classpath-exception-2.0 OR MIT"), [["GPL-2.0-only WITH Classpath-exception-2.0"], ["MIT"]]);
  assert.deepEqual(ids("((MIT))"), [["MIT"]]);
  assert.deepEqual(ids("mit or apache-2.0"), [["mit"], ["apache-2.0"]], "lower-case operators from lockfiles");
  assert.deepEqual(ids("GPL-2.0+ OR LicenseRef-Custom"), [["GPL-2.0+"], ["LicenseRef-Custom"]]);
});

test("SPDX expressions: anything else is undefined, never an exception", () => {
  for (const bad of ["", " ", "MIT OR", "OR MIT", "(MIT", "MIT)", "MIT AND AND ISC", "Apache 2.0", "MIT WITH", "MIT WITH OR",
    "BSD-3-Clause, MIT", "SEE LICENSE IN LICENSE", "()", "MIT ISC", "a".repeat(3000)]) {
    assert.equal(parseSpdx(bad), undefined, bad);
  }
  for (const value of [undefined, null, 42, {}, ["MIT"]]) assert.equal(parseSpdx(value), undefined);
  assert.equal(parseSpdx("(".repeat(100) + "MIT" + ")".repeat(100)), undefined, "too deep");
  assert.equal(choices(Array.from({ length: 8 }, (_, i) => `(A${i} OR B${i})`).join(" AND ")), undefined, "too many alternatives");
  // Random garbage never throws.
  const alphabet = ["(", ")", " ", "AND", "OR", "WITH", "MIT", "+", "-", ":", "é", "\n"];
  for (let i = 0; i < 2000; i++) {
    const text = Array.from({ length: 1 + (i % 15) }, (_, k) => alphabet[(i * 7 + k * 13) % alphabet.length]).join(" ");
    assert.doesNotThrow(() => choices(text));
  }
});

test("SPDX ids: current, deprecated, custom, unknown", () => {
  assert.equal(spdxStatus("MIT"), "current");
  assert.equal(spdxStatus("apache-2.0"), "current");
  assert.equal(spdxStatus("GPL-3.0"), "deprecated");
  assert.equal(spdxStatus("GPL-2.0+"), "deprecated");
  assert.equal(spdxStatus("MPL-2.0+"), "current");
  assert.equal(spdxStatus("LicenseRef-Acme"), "custom");
  assert.equal(spdxStatus("BSD"), "unknown");
});

test("categories from data/licenses.yml, with exceptions", () => {
  const cat = (id: string, exception?: string) => classify({ id, exception }).category;
  assert.equal(cat("MIT"), "permissive");
  assert.equal(cat("BSL-1.0"), "permissive", "Boost, not Business Source");
  assert.equal(cat("BUSL-1.1"), "source_available");
  assert.equal(cat("Apache-2.0", "Commons-Clause"), "source_available");
  assert.equal(cat("CC-BY-NC-SA-4.0"), "source_available");
  assert.equal(cat("AGPL-3.0-only"), "network_copyleft");
  assert.equal(cat("EUPL-1.2"), "network_copyleft");
  assert.equal(cat("GPL-3.0-or-later"), "copyleft");
  assert.equal(cat("GPL-2.0-only", "Classpath-exception-2.0"), "weak_copyleft");
  assert.equal(cat("LGPL-2.1-only"), "weak_copyleft");
  assert.equal(cat("Artistic-1.0"), "other");
  assert.equal(cat("Apache 2"), "unknown");
  assert.equal(cat("LicenseRef-Acme"), "unknown");
  assert.equal(cat("LicenseRef-Acme-NonCommercial"), "source_available");
});

test("a license field: the least restrictive choice, and what no choice avoids", () => {
  assert.equal(readLicense(undefined).status, "missing");
  assert.equal(readLicense("UNLICENSED").status, "unlicensed");
  assert.equal(readLicense("SEE LICENSE IN LICENSE.txt").status, "see_file");
  assert.equal(readLicense("NOASSERTION").status, "unknown");
  assert.equal(readLicense("MIT, ISC").status, "invalid");
  const dual = readLicense("GPL-3.0-only OR MIT");
  assert.deepEqual(dual.chosen.map((t) => t.id), ["MIT"]);
  const gpl = (t: { category: string }) => t.category === "copyleft";
  assert.equal(unavoidable(dual, gpl), false);
  assert.equal(unavoidable(readLicense("GPL-3.0-only AND MIT"), gpl), true);
  assert.equal(unavoidable(readLicense("GPL-2.0-only OR GPL-3.0-only"), gpl), true);
  assert.equal(unavoidable(readLicense("UNLICENSED"), gpl), false);
});

test("versions compare as dotted numbers, pre-releases before their release", () => {
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareVersions("1.13.3", "2.0.0"), -1);
  assert.equal(compareVersions("10.0.0", "9.26.0"), 1);
  assert.equal(compareVersions("v1.6.0", "v1.5.7"), 1);
  assert.equal(compareVersions("v8.0.0+incompatible", "v8.0.0"), 0);
  assert.equal(compareVersions("2.0.0-beta.1", "2.0.0"), -1);
  assert.equal(compareVersions("0.301.1", "0.301.1"), 0);
  assert.equal(compareVersions("dev-main", "1.0.0"), -1);
});

const TEXTS = loadYaml<Record<string, string>>("data/license-texts.yml");
const MIT = `MIT License

Copyright (c) 2024 Jane Doe

${TEXTS.MIT.split("\n").slice(3).join("\n")}`;

test("license texts: the family from its wording", () => {
  assert.equal(detectLicenseText(MIT), "MIT");
  for (const id of Object.keys(TEXTS)) assert.equal(detectLicenseText(TEXTS[id]), id);
  assert.equal(detectLicenseText("GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3"), "AGPL-3.0");
  assert.equal(detectLicenseText("GNU LESSER GENERAL PUBLIC LICENSE\n Version 2.1, February 1999"), "LGPL-2.1");
  assert.equal(detectLicenseText("GNU GENERAL PUBLIC LICENSE\n Version 2, June 1991"), "GPL-2.0");
  assert.equal(detectLicenseText("All rights reserved."), undefined);
});

test("license texts: replaced names count as neither added nor removed, an added clause does", () => {
  const ref = normalizeLicenseText(TEXTS.MIT);
  const same = licenseChanges(normalizeLicenseText(MIT), ref);
  assert.deepEqual(same, { added: 0, removed: 0 });
  const wrapped = licenseChanges(normalizeLicenseText(`The MIT License (MIT)\n\nCopyright Jane Doe\nAll rights reserved.\n\n${MIT.replace(/ /g, "\n")}\n\n---\nBundled code: see NOTICE.`), ref);
  assert.deepEqual(wrapped, { added: 0, removed: 0 }, "wrapping, titles and trailing notes do not count");
  const evil = licenseChanges(normalizeLicenseText(MIT.replace("portions of the Software.", "portions of the Software.\n\nThe Software shall be used for Good, not Evil.")), ref);
  assert.ok(evil.added - evil.removed >= 6, JSON.stringify(evil));
  const cut = licenseChanges(normalizeLicenseText(MIT.replace(/The above copyright notice[^.]*\./, "")), ref);
  assert.ok(cut.removed - cut.added >= 6, JSON.stringify(cut));
  const apache = TEXTS["Apache-2.0"].replace(/\n/g, "\n      ");
  assert.deepEqual(licenseChanges(normalizeLicenseText(apache), normalizeLicenseText(TEXTS["Apache-2.0"])), { added: 0, removed: 0 });
});

test("dependencies: license data only from lockfiles that carry it, dev dependencies left out", async () => {
  const repo = await repoFromFiles({
    "package.json": "{}",
    "package-lock.json": npmLock({ a: { version: "1.0.0", license: "MIT" }, b: { version: "1.0.0" }, c: { version: "1.0.0", license: "GPL-3.0-only", dev: true } }),
    "web/yarn.lock": 'left-pad@^1.0.0:\n  version "1.3.0"\n',
    "Cargo.lock": '[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n',
  });
  const deps = dependencyLicenses(repo);
  assert.deepEqual(deps.checked.map((d) => `${d.component.name}:${d.license.status}`).sort(), ["a:ok", "b:missing"]);
  assert.deepEqual(deps.unchecked.map((c) => c.name).sort(), ["left-pad", "serde"]);
  assert.deepEqual(deps.uncheckedEcosystems, ["cargo", "npm"]);
});

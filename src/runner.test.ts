import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, moduleOf, runChecks, scopeOf, selectModules, SCOPES, unknownModules } from "./runner.ts";
import { PROPOSALS, SWITCHES, reviewProblems, validateRule, type Rule, type Switch } from "./rules.ts";
import { suppressionsSchema, EXAMPLE_SUPPRESSIONS, SCHEMA_FILE, exampleRulesYaml, fillYaml, tagsAsCode, wikiPages } from "./docs.ts";
import { loadYaml } from "./data.ts";
import { DAY } from "./deadline.ts";
import { groupPage } from "./wiki.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, defineCrossCheck, defineRepoCheck, pass, skip } from "./sdk.ts";
import { render } from "./messages.ts";

const rule = { id: "SEC-TEST-001", severity: "low", title: "t", how: "Reads something and compares it.", fix_hint: "f", meta: { last_reviewed: "2026-11-03", sources: ["https://www.w3.org/TR/WCAG22/"] } } as Rule;

test("every check has a folder id and a valid rule.yml with a unique id", async () => {
  const checks = await loadChecks();
  assert.ok(checks.every((c) => /^[a-z]+\/[a-z0-9-]+$/.test(c.id)), checks.map((c) => c.id).join(", "));
  const ids = checks.map((c) => c.rule.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate rule ids");
});

test("the rule validator rejects broken rules", () => {
  assert.deepEqual(validateRule(rule), []);
  assert.match(validateRule({ ...rule, id: "imprint" }).join(), /does not match/);
  assert.match(validateRule({ ...rule, title: { de: "t", en: "t" } as unknown as Rule["title"] }).join(), /title must be a text in English/);
  assert.match(validateRule({ ...rule, fix_hint: " " }).join(), /fix_hint must be a text in English/);
  assert.deepEqual(validateRule({ ...rule, meta: { ...rule.meta, last_reviewed: "2020-01-01" } }), [], "the age of a review is not a structural problem");
  assert.match(validateRule({ ...rule, meta: { ...rule.meta, sources: [] } }).join(), /needs at least one source/);
  const cited = (url: string) => validateRule({ ...rule, meta: { ...rule.meta, sources: [url] } });
  assert.deepEqual(cited("https://www.gesetze-im-internet.de/bgb/__312k.html"), []);
  assert.match(cited("https://some-law-blog.example/cookies").join(), /not from a domain in data\/source-domains\.yml/);
  assert.match(cited("https://eur-lex.europa.eu.evil.example/").join(), /not from a domain/);
});

test("every rule was reviewed within a year (maintenance check, not part of a scan)", async () => {
  assert.deepEqual(reviewProblems(rule, new Date("2026-11-03")), []);
  assert.match(reviewProblems(rule, new Date("2028-01-01")).join(), /older than 365 days/);
  const stale = (await loadChecks()).flatMap((c) => reviewProblems(c.rule).map((p) => `${c.id}: ${p}`));
  assert.deepEqual(stale, []);
});

// #44: a pinned release must keep scanning after its review dates are a year old.
test("loading the checks does not depend on the date", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2099-01-01") });
  const checks = await loadChecks();
  assert.ok(checks.length > 0);
  assert.ok(checks.every((c) => reviewProblems(c.rule).length > 0), "the clock is in the future, so every review counts as old");
});

test("a quality rule states its value instead of a legal basis, and no rule has both", async () => {
  const value = "Benefit";
  const law = "Art. 32 GDPR";
  assert.deepEqual(validateRule({ ...rule, value }, "quality"), []);
  assert.match(validateRule(rule, "quality").join(), /need value/);
  assert.match(validateRule({ ...rule, value, legal_basis: law }, "quality").join(), /have no legal_basis/);
  assert.match(validateRule({ ...rule, value, legal_basis: law }, "security").join(), /value is only for rules without legal_basis/);
  assert.match(validateRule({ ...rule, value: "" }).join(), /value must be a text in English/);
  const quality = (await loadChecks()).filter((c) => moduleOf(c.id) === "quality");
  assert.ok(quality.length > 0 && quality.every((c) => c.rule.value && !c.rule.legal_basis));
  // The wiki says so, never a bare "Technical" that could read like a duty by omission.
  const page = wikiPages(quality, {}, "main")[`${groupPage("quality")}.md`];
  for (const c of quality) assert.ok(page.includes(`No legal basis: ${c.rule.value}`), c.id);
});

test("a rule of the DFA proposal has no legal basis and names the proposal first in value", async () => {
  const value = "Digital Fairness Act proposal COM(2026) 1100, Annex I point 61: would ban it.";
  assert.deepEqual(validateRule({ ...rule, id: "LEG-DFA-001", value }, "dfa"), []);
  assert.match(validateRule({ ...rule, value, legal_basis: "Art. 61" }, "dfa").join(), /have no legal_basis/);
  assert.match(validateRule({ ...rule, value: "Would be banned." }, "dfa").join(), /need value: "Digital Fairness Act proposal COM\(2026\) 1100, <article>: \.\.\."/);
  const dfa = (await loadChecks()).filter((c) => moduleOf(c.id) === "dfa");
  assert.ok(dfa.length > 0 && dfa.every((c) => c.rule.id.startsWith("LEG-DFA-") && !c.rule.legal_basis), dfa.map((c) => c.rule.id).join());
});

test("data/proposals.yml: each proposal has a known status, official sources and was checked within proposals.max_age_days", () => {
  const { max_age_days } = loadYaml<{ proposals: { max_age_days: number } }>("data/thresholds.yml").proposals;
  for (const p of PROPOSALS) {
    assert.ok(["proposal", "adopted", "in force", "applies"].includes(p.status), `${p.id}: status ${p.status}`);
    assert.ok(p.sources.length && p.sources.every((s) => !validateRule({ ...rule, meta: { ...rule.meta, sources: [s] } }).length), `${p.id}: sources`);
    const age = (Date.now() - new Date(p.checked).getTime()) / DAY;
    assert.ok(age >= 0 && age <= max_age_days, `${p.id}: checked ${p.checked} is older than ${max_age_days} days; compare status and articles with ${p.sources[0]}`);
  }
});

test("a rule of the DFA proposal says on its wiki page that it has no legal basis", async () => {
  const checks = await loadChecks();
  const pages = wikiPages(checks, {}, "main");
  for (const c of checks.filter((x) => moduleOf(x.id) === "dfa")) {
    assert.ok(pages[`${groupPage(moduleOf(c.id))}.md`].includes(`No legal basis: ${c.rule.value}`), c.id);
  }
});

test("rule.yml how names every data file its check.ts loads", async () => {
  const missing = (await loadChecks()).flatMap((c) => {
    const code = readFileSync(new URL(`../checks/${c.id}/check.ts`, import.meta.url), "utf8");
    const files = [...new Set(code.match(/data\/[a-z0-9-]+\.yml/g) ?? [])];
    return files.filter((f) => !c.rule.how.includes(f)).map((f) => `${c.id}: ${f}`);
  });
  assert.deepEqual(missing, []);
});

test("the scope follows the check type: defineCheck reads the website, defineRepoCheck the repository, defineCrossCheck both", async () => {
  assert.equal(scopeOf(defineCheck({ run: () => pass({ key: "x" }) })), "website");
  assert.equal(scopeOf(defineRepoCheck({ run: () => pass({ key: "x" }) })), "repository");
  assert.equal(scopeOf(defineCrossCheck({ run: () => pass({ key: "x" }) })), "both");
  const checks = await loadChecks();
  assert.ok(checks.some((c) => scopeOf(c.check) === "both"), "at least one check reads both");
});

test("groups are legal or topic areas, not scan targets: no checks/repo/ folder", async () => {
  const groups = new Set((await loadChecks()).map((c) => moduleOf(c.id)));
  assert.deepEqual([...groups].filter((g) => (SCOPES as readonly string[]).includes(g) || g === "repo"), []);
});

test("HTML tags in rule texts become code on the wiki, existing code stays", async () => {
  assert.equal(tagsAsCode("Use <picture> and `<img alt>`, not </div>."), "Use `<picture>` and `<img alt>`, not `</div>`.");
  const pages = Object.values(wikiPages(await loadChecks(), {}, "main")).join("\n");
  const outside = pages.split("\n").filter((l) => !l.startsWith("<!-- Generated from ")).join("\n").split(/`[^`]*`/).join("");
  assert.deepEqual(outside.match(/<\/?[a-zA-Z][^<>]*>/g) ?? [], []);
});

test("each rule on its wiki page carries the scope of its check", async () => {
  const checks = await loadChecks();
  const pages = wikiPages(checks, {}, "main");
  const label = { website: "Website", repository: "Repository", both: "Repository + website" };
  for (const c of checks) {
    const page = pages[`${groupPage(moduleOf(c.id))}.md`];
    const entry = page.slice(page.indexOf(`## ${c.rule.id}\n`)).split("\n")[2];
    assert.ok(entry.includes(` · ${label[scopeOf(c.check)]} · `), `${c.id}: ${label[scopeOf(c.check)]}`);
  }
});
test("modules select checks by group only; anything else is unknown", async () => {
  const checks = await loadChecks();
  const ids = (modules: string[]) => selectModules(checks, modules).map((c) => c.id);
  const legal = ids(["legal"]);
  assert.ok(legal.length > 0 && legal.every((id) => id.startsWith("legal/")));
  assert.deepEqual(ids(["legal", "security"]), checks.filter((c) => /^(legal|security)\//.test(c.id)).map((c) => c.id));
  assert.ok(ids(["security"]).some((id) => scopeOf(checks.find((c) => c.id === id)!.check) === "repository"), "security includes repository checks");
  assert.deepEqual(ids([]), checks.map((c) => c.id));
  assert.deepEqual(unknownModules(checks, ["legal", "repo", "website", "both", "repository"]), ["repo", "website", "both", "repository"]);
});

test("a check of both scopes gets both contexts, and without one of them is a skip that says which is missing", async () => {
  let got: unknown[] = [];
  const both = { id: "security/both", rule, check: defineCrossCheck({ run: (ctx, repo) => ((got = [ctx, repo]), pass({ key: "ran" })) }) };
  const web = fakeContext({});
  const repo = { files: [] } as never;
  const [ran] = await runChecks([both], { web, repo });
  assert.equal(ran.status, "pass");
  assert.deepEqual(got, [web, repo]);
  const cases = [[{ web }, "repository"], [{ repo }, "url"], [{}, "both"]] as const;
  for (const [targets, missing] of cases) {
    const [o] = await runChecks([both], targets);
    assert.deepEqual([o.status, o.because], ["skip", { kind: "target", missing, both: true }]);
    assert.match(render(o.message, o.id), /repository|Repository/);
  }
});

test("the schema and the rule list in examples/ are up to date (npm run docs)", async () => {
  const checks = await loadChecks();
  assert.equal(readFileSync(SCHEMA_FILE, "utf8"), suppressionsSchema(checks), "run: npm run docs (examples/rechtzeitig.schema.json)");
  const template = readFileSync(EXAMPLE_SUPPRESSIONS, "utf8");
  assert.equal(template, fillYaml(template, "rules", exampleRulesYaml(checks)), "run: npm run docs (examples/rechtzeitig.yml)");
});

test("a broken check becomes an error and the others still run", async () => {
  const checks = [
    { id: "x/throws", rule, check: defineCheck({ run: () => { throw new Error("boom"); } }) },
    { id: "x/empty", rule, check: defineCheck({ run: () => undefined as never }) },
    { id: "x/ok", rule, check: defineCheck({ run: () => pass({ key: "fine" }) }) },
  ];
  const outcomes = await runChecks(checks, { web: fakeContext({}) });
  assert.deepEqual(outcomes.map((o) => o.status), ["error", "error", "pass"]);
  assert.equal(outcomes[0].message, "boom");
});

test("a check that throws a non-Error still gets a message", async () => {
  const checks = [{ id: "x/string", rule, check: defineCheck({ run: () => { throw "plain text\nsecond line"; } }) }];
  const [outcome] = await runChecks(checks, { web: fakeContext({}) });
  assert.equal(outcome.message, "plain text");
});

test("asking for an unknown concept is an error, not a silent pass", async () => {
  const checks = [{ id: "x/typo", rule, check: defineCheck({ run: (ctx) => pass({ key: String(ctx.says("imprnt", "x")) }) }) }];
  const [outcome] = await runChecks(checks, { web: fakeContext({}) });
  assert.equal(outcome.status, "error");
  assert.match(String(outcome.message), /Unknown concept "imprnt"/);
});

test("a check without its target or outside modules is a skip that says why, in every language", async () => {
  const web = { id: "legal/web", rule, check: defineCheck({ run: () => pass({ key: "ran" }) }) };
  const repo = { id: "repo/files", rule, check: defineRepoCheck({ run: () => pass({ key: "ran" }) }) };
  const empty = { id: "repo/empty", rule, check: defineRepoCheck({ run: () => skip({ key: "nothing" }) }) };
  const onlyWeb = await runChecks([web, repo], { web: fakeContext({}) });
  assert.deepEqual(onlyWeb.map((o) => [o.status, o.because]), [["pass", undefined], ["skip", { kind: "target", missing: "repository" }]]);
  const nothing = await runChecks([web], {});
  assert.deepEqual(nothing[0].because, { kind: "target", missing: "url" });
  const filtered = await runChecks([web, repo], { web: fakeContext({}) }, [], ["repo"]);
  assert.deepEqual(filtered[0].because, { kind: "module", modules: ["repo"] });
  assert.match(render(filtered[0].message, filtered[0].id), /its group legal is not in modules \(repo\)/);
  for (const o of [onlyWeb[1], nothing[0], filtered[0]]) assert.ok(render(o.message, o.id).length > 10);
  const [own] = await runChecks([empty], { repo: {} as never });
  assert.deepEqual(own.because, { kind: "data" });
});

test("every switch skips its rules when off, with a message that names it", async () => {
  for (const input of Object.keys(SWITCHES) as Switch[]) {
    const checks = [{ id: "x/switch", rule: { ...rule, requires: [input] }, check: defineCheck({ run: () => pass({ key: "ran" }) }) }];
    const [off] = await runChecks(checks, { web: fakeContext({}) });
    assert.equal(off.status, "skip", input);
    assert.match(render(off.message, off.id), new RegExp(input.split("-")[0]), input);
    const [on] = await runChecks(checks, { web: fakeContext({}) }, [input]);
    assert.equal(on.status, "pass", input);
  }
});

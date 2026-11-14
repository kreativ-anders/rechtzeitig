import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, moduleOf, runChecks, scopeOf, selectModules, SCOPES } from "./runner.ts";
import { LANGUAGES, SWITCHES, reviewProblems, validateRule, type Rule, type Switch } from "./rules.ts";
import { checksHtml, crossChecksHtml, exampleWorkflowHtml, SCOPE_LABELS, heroChecksHtml, reviewedHtml, scopeCountHtml, securityChecks, shopChecks, switchesHtml, topicRulesHtml } from "./docs.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, defineCrossCheck, defineRepoCheck, pass, skip } from "./sdk.ts";
import { render } from "./messages.ts";

const rule = { id: "SEC-TEST-001", severity: "low", title: { de: "t", en: "t" }, how: "Reads something and compares it.", fix_hint: { de: "f", en: "f" }, meta: { last_reviewed: "2026-11-03", sources: ["https://www.w3.org/TR/WCAG22/"] } } as Rule;

test("every check has a folder id and a valid rule.yml with a unique id", async () => {
  const checks = await loadChecks();
  assert.ok(checks.every((c) => /^[a-z]+\/[a-z0-9-]+$/.test(c.id)), checks.map((c) => c.id).join(", "));
  const ids = checks.map((c) => c.rule.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate rule ids");
});

test("the rule validator rejects broken rules", () => {
  assert.deepEqual(validateRule(rule), []);
  assert.match(validateRule({ ...rule, id: "imprint" }).join(), /does not match/);
  assert.match(validateRule({ ...rule, title: { de: "t" } as Rule["title"] }).join(), /title\.en is missing/);
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
  const value = { de: "Nutzen", en: "Benefit" };
  const law = { de: "Art. 32 DSGVO", en: "Art. 32 GDPR" };
  assert.deepEqual(validateRule({ ...rule, value }, "quality"), []);
  assert.match(validateRule(rule, "quality").join(), /need value/);
  assert.match(validateRule({ ...rule, value, legal_basis: law }, "quality").join(), /have no legal_basis/);
  assert.match(validateRule({ ...rule, value, legal_basis: law }, "security").join(), /value is only for rules without legal_basis/);
  assert.match(validateRule({ ...rule, value: { de: "x" } as Rule["value"] }).join(), /value\.en is missing/);
  const quality = (await loadChecks()).filter((c) => moduleOf(c.id) === "quality");
  assert.ok(quality.length > 0 && quality.every((c) => c.rule.value && !c.rule.legal_basis));
  // The card says so, never a bare "Technical" that could read like a duty by omission.
  for (const c of quality) assert.ok(checksHtml([c]).includes(`No legal basis: ${c.rule.value!.en}`), c.id);
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
  for (const scope of SCOPES) assert.ok(SCOPE_LABELS[scope], `label for scope ${scope}`);
});

test("groups are legal or topic areas, not scan targets: no checks/repo/ folder", async () => {
  const groups = new Set((await loadChecks()).map((c) => moduleOf(c.id)));
  assert.deepEqual([...groups].filter((g) => (SCOPES as readonly string[]).includes(g) || g === "repo"), []);
});

test("each card on checks.html carries the scope of its check", async () => {
  const checks = await loadChecks();
  const html = checksHtml(checks);
  for (const c of checks) {
    const scope = scopeOf(c.check);
    assert.ok(html.includes(`id="${c.rule.id}" data-module="${moduleOf(c.id)}" data-scope="${scope}"`), `${c.id}: data-scope="${scope}"`);
  }
});

test("modules select checks by group or by scope; repo still means all repository checks; both counts for either", async () => {
  const checks = await loadChecks();
  const ids = (modules: string[]) => selectModules(checks, modules).map((c) => c.id);
  const of = (...scopes: string[]) => checks.filter((c) => scopes.includes(scopeOf(c.check))).map((c) => c.id);
  const legal = ids(["legal"]);
  assert.ok(legal.length > 0 && legal.every((id) => id.startsWith("legal/")));
  assert.ok(of("repository").length > 0 && of("both").length > 0);
  assert.deepEqual(ids(["repo"]), of("repository", "both"));
  assert.deepEqual(ids(["repository"]), of("repository", "both"));
  assert.deepEqual(ids(["website"]), of("website", "both"));
  assert.deepEqual(ids(["both"]), of("both"));
  // Union: a check runs when its group or its scope is listed.
  assert.deepEqual(ids(["legal", "repo"]), checks.filter((c) => c.id.startsWith("legal/") || scopeOf(c.check) !== "website").map((c) => c.id));
  assert.ok(ids(["security"]).some((id) => scopeOf(checks.find((c) => c.id === id)!.check) === "repository"), "security includes repository checks");
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
    for (const lang of LANGUAGES) assert.match(render(o.message, o.id, lang), /repository|Repository/);
  }
});

test("the generated parts of docs/ are up to date (npm run docs)", async () => {
  const checks = await loadChecks();
  const page = (name: string) => readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");
  assert.ok(page("checks.html").includes(checksHtml(checks)), "run: npm run docs");
  for (const name of ["checks.html", "workflow.html"]) assert.ok(page(name).includes(switchesHtml(checks)), `run: npm run docs (${name})`);
  for (const [name, lang] of [["index.html", "en"], ["de/index.html", "de"]] as const) {
    const parts = [heroChecksHtml(checks, lang), reviewedHtml(checks, lang), crossChecksHtml(checks, lang), ...SCOPES.map((s) => scopeCountHtml(checks, s, lang))];
    for (const html of parts) assert.ok(page(name).includes(html), `run: npm run docs (${name})`);
  }
  const example = readFileSync(new URL("../examples/workflows/rechtzeitig.yml", import.meta.url), "utf8");
  assert.ok(page("getting-started.html").includes(exampleWorkflowHtml(example)), "run: npm run docs (getting-started.html)");
  assert.ok(page("security.html").includes(topicRulesHtml(securityChecks(checks))), "run: npm run docs (security.html)");
  assert.ok(page("de/kuendigungsbutton.html").includes(topicRulesHtml(shopChecks(checks), "de")), "run: npm run docs (de/kuendigungsbutton.html)");
});

for (const name of ["index.html", "de/index.html"]) test(`the FAQPage data in docs/${name} matches the visible questions`, () => {
  const html = readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");
  const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,:;)])/g, "$1").replace(/\( /g, "(").trim();
  const faq = html.slice(html.indexOf('<div class="faq">'));
  const visible = [...faq.matchAll(/<details[^>]*>\s*<summary>(.*?)<\/summary>(.*?)<\/details>/gs)].map((m) => [plain(m[1]), plain(m[2])]);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
  const page = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage");
  const data = page.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, plain(q.acceptedAnswer.text)]);
  assert.ok(visible.length > 0);
  assert.deepEqual(data, visible);
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
  assert.match(render(filtered[0].message, filtered[0].id, "en"), /group legal nor its scope website/);
  const byScope = await runChecks([web, repo], { web: fakeContext({}) }, [], ["website"]);
  assert.deepEqual(byScope.map((o) => o.because?.kind), [undefined, "module"]);
  for (const o of [onlyWeb[1], nothing[0], filtered[0]]) for (const lang of LANGUAGES) assert.ok(render(o.message, o.id, lang).length > 10);
  const [own] = await runChecks([empty], { repo: {} as never });
  assert.deepEqual(own.because, { kind: "data" });
});

test("every switch skips its rules when off, with a message in every language", async () => {
  for (const input of Object.keys(SWITCHES) as Switch[]) {
    const checks = [{ id: "x/switch", rule: { ...rule, requires: [input] }, check: defineCheck({ run: () => pass({ key: "ran" }) }) }];
    const [off] = await runChecks(checks, { web: fakeContext({}) });
    assert.equal(off.status, "skip", input);
    for (const lang of LANGUAGES) assert.match(render(off.message, off.id, lang), new RegExp(input.split("-")[0]), `${input} in ${lang}`);
    const [on] = await runChecks(checks, { web: fakeContext({}) }, [input]);
    assert.equal(on.status, "pass", input);
  }
});

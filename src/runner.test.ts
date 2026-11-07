import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadChecks, runChecks, selectModules } from "./runner.ts";
import { LANGUAGES, SWITCHES, validateRule, type Rule, type Switch } from "./rules.ts";
import { checksHtml, heroChecksHtml, reviewedHtml, securityChecks, shopChecks, switchesHtml, topicRulesHtml } from "./docs.ts";
import { fakeContext } from "../test/helpers.ts";
import { defineCheck, defineRepoCheck, pass, skip } from "./sdk.ts";
import { render } from "./messages.ts";

const rule = { id: "SEC-TEST-001", severity: "low", title: { de: "t", en: "t" }, how: "Reads something and compares it.", fix_hint: { de: "f", en: "f" }, meta: { last_reviewed: "2026-11-03", sources: ["https://www.w3.org/TR/WCAG22/"] } } as Rule;

test("every check has a folder id and a valid rule.yml with a unique id", async () => {
  const checks = await loadChecks();
  assert.ok(checks.every((c) => /^[a-z]+\/[a-z0-9-]+$/.test(c.id)), checks.map((c) => c.id).join(", "));
  const ids = checks.map((c) => c.rule.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate rule ids");
});

test("the rule validator rejects broken rules", () => {
  assert.deepEqual(validateRule(rule, new Date("2026-11-03")), []);
  assert.match(validateRule({ ...rule, id: "imprint" }).join(), /does not match/);
  assert.match(validateRule({ ...rule, title: { de: "t" } as Rule["title"] }).join(), /title\.en is missing/);
  assert.match(validateRule(rule, new Date("2028-01-01")).join(), /older than 365 days/);
  assert.match(validateRule({ ...rule, meta: { ...rule.meta, sources: [] } }).join(), /needs at least one source/);
  const cited = (url: string) => validateRule({ ...rule, meta: { ...rule.meta, sources: [url] } }, new Date("2026-11-03"));
  assert.deepEqual(cited("https://www.gesetze-im-internet.de/bgb/__312k.html"), []);
  assert.match(cited("https://some-law-blog.example/cookies").join(), /not from a domain in data\/source-domains\.yml/);
  assert.match(cited("https://eur-lex.europa.eu.evil.example/").join(), /not from a domain/);
});

test("rule.yml how names every data file its check.ts loads", async () => {
  const missing = (await loadChecks()).flatMap((c) => {
    const code = readFileSync(new URL(`../checks/${c.id}/check.ts`, import.meta.url), "utf8");
    const files = [...new Set(code.match(/data\/[a-z0-9-]+\.yml/g) ?? [])];
    return files.filter((f) => !c.rule.how.includes(f)).map((f) => `${c.id}: ${f}`);
  });
  assert.deepEqual(missing, []);
});

test("repository checks live in checks/repo/ and website checks elsewhere", async () => {
  const wrong = (await loadChecks()).filter((c) => c.id.startsWith("repo/") !== !!c.check.repo).map((c) => c.id);
  assert.deepEqual(wrong, []);
});

test("modules select checks by folder", async () => {
  const ids = selectModules(await loadChecks(), ["legal"]).map((c) => c.id);
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith("legal/")));
});

test("the generated parts of docs/ are up to date (npm run docs)", async () => {
  const checks = await loadChecks();
  const page = (name: string) => readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");
  assert.ok(page("checks.html").includes(checksHtml(checks)), "run: npm run docs");
  for (const name of ["checks.html", "workflow.html"]) assert.ok(page(name).includes(switchesHtml(checks)), `run: npm run docs (${name})`);
  for (const html of [heroChecksHtml(checks), reviewedHtml(checks)]) assert.ok(page("index.html").includes(html), "run: npm run docs (index.html)");
  for (const html of [heroChecksHtml(checks, "de"), reviewedHtml(checks, "de")]) assert.ok(page("de/index.html").includes(html), "run: npm run docs (de/index.html)");
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

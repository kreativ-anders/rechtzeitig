// Generates from rule.yml files, action.yml and SWITCHES in src/rules.ts: npm run docs
// - examples/rechtzeitig.schema.json, the JSON Schema of .github/rechtzeitig.yml,
// - the list of every rule in its template examples/rechtzeitig.yml,
// - the generated pages of the wiki (src/wiki.ts) in wiki/, a clone of the wiki that is not part of this repository:
//   Inputs, Checks and one Checks-<Group> per group. The release workflow pushes them; locally they only feed the tests.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEVERITIES, reviewProblems, switchSpec, type Switch } from "./rules.ts";
import { loadChecks, moduleOf, scopeOf, type LoadedCheck, type Scope } from "./runner.ts";
import { CATEGORIES, NEEDS_EXPIRY, SUPPRESSIONS_FILE, SUPPRESSIONS_RULE } from "./suppress.ts";
import { loadYaml } from "./data.ts";
import { WIKI, groupPage } from "./wiki.ts";

/** Template for .github/rechtzeitig.yml; its list of every rule between "# rules:start" and "# rules:end" is generated. */
export const EXAMPLE_SUPPRESSIONS = new URL("../examples/rechtzeitig.yml", import.meta.url);
/** JSON Schema of .github/rechtzeitig.yml, for editor completion. */
export const SCHEMA_FILE = new URL("../examples/rechtzeitig.schema.json", import.meta.url);
export const SCHEMA_URL = "https://raw.githubusercontent.com/kreativ-anders/rechtzeitig/main/examples/rechtzeitig.schema.json";
/** Local clone of the wiki, ignored by git. */
export const WIKI_DIR = new URL("../wiki/", import.meta.url);

/** An input in action.yml. One with `deprecationMessage` was removed: GitHub warns when a workflow sets it. */
export interface ActionInput { description: string; default?: string; deprecationMessage?: string }

/** Check groups (folders in checks/) in the order of the docs, with what each covers. */
const MODULES: Record<string, [string, string]> = {
  legal: ["Legal", "Imprint, privacy policy, licenses, and for shops and subscriptions the cancellation, withdrawal and order buttons, prices and T&Cs."],
  privacy: ["Privacy and consent", "Cookies, trackers and third parties before consent, the consent banner, and whether the privacy policy names what the site and the code use."],
  security: ["Security", "Headers, TLS, exposed files, committed secrets, vulnerable or invented packages, risky workflows and AI agent settings."],
  sustainability: ["Sustainability", "Caching, compression, image formats, lazy loading, pages that work without JavaScript, green hosting."],
  accessibility: ["Accessibility", "Basics an automated test can find: alt texts, labels, contrast, language, ARIA."],
  quality: ["Code quality", "Shortcuts that hide problems: hollow tests, neutralized CI, placeholder code, broken suppressions. No legal basis."],
};
const SCOPE: Record<Scope, string> = { website: "Website", repository: "Repository", both: "Repository + website" };

const cell = (s: string) => s.replace(/\s+/g, " ").replace(/[\\|]/g, "\\$&").trim();
/** HTML tags in rule texts as code, outside existing code spans, so the wiki shows them instead of dropping them. */
export const tagsAsCode = (s: string) => s.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/<\/?[a-zA-Z][^<>]*>/g, "`$&`"))).join("");
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const bySeverity = (a: LoadedCheck, b: LoadedCheck) => SEVERITIES.indexOf(b.rule.severity) - SEVERITIES.indexOf(a.rule.severity) || a.rule.id.localeCompare(b.rule.id);

/** When a rule with this input runs. */
function runsWhen(input: Switch): string {
  const s = switchSpec(input);
  if (s.secret) return `only with the secret \`${s.secret}\` (sends data to ${s.service})`;
  if (s.service) return `only with \`${input}: true\` (sends data to ${s.service})`;
  return `only with \`${input}: true\``;
}

/** The generated wiki pages by file name. `ref` is the tag the code links point to. */
export function wikiPages(checks: LoadedCheck[], inputs: Record<string, ActionInput>, ref: string): Record<string, string> {
  const generated = (from: string) => `<!-- Generated from ${from} of rechtzeitig ${ref} by npm run docs. Edit those, not this page. -->`;
  const code = `https://github.com/kreativ-anders/rechtzeitig/tree/${ref}/checks`;
  const pages: Record<string, string> = {};
  const overview = [
    generated("checks/**/rule.yml"),
    "",
    `All ${checks.length} checks, one page per group. Each names its legal basis and primary sources; findings are risk hints, not legal advice.`,
    "",
    "**Scope** says what a check reads: *Website* runs with a `url`, *Repository* when `actions/checkout` runs before rechtzeitig, *Repository + website* needs both. `modules` picks groups or scopes, see [Inputs](Inputs). To turn one rule off: [Suppressions](Suppressions).",
    "",
    "| Group | Checks | What |",
    "|---|---|---|",
  ];
  for (const [module, [name, intro]] of Object.entries(MODULES)) {
    const list = checks.filter((c) => moduleOf(c.id) === module).sort(bySeverity);
    overview.push(`| [${name}](${groupPage(module)}) | ${list.length} | ${intro} |`);
    const lines = [generated("checks/**/rule.yml"), "", `${intro} ${list.length} checks, most severe first. All groups: [Checks](Checks).`];
    for (const { id, rule: r, check } of list) {
      const basis = r.legal_basis ?? (r.value ? `No legal basis: ${r.value}` : "Technical, no single law");
      lines.push(
        "",
        `## ${r.id}`,
        "",
        `**${tagsAsCode(cell(r.title))}** · ${r.severity} · ${SCOPE[scopeOf(check)]} · ${tagsAsCode(cell(basis))}`,
        "",
        `- **How:** ${tagsAsCode(r.how)}`,
        ...(r.requires ?? []).map((i) => `- **Runs:** ${runsWhen(i)}`),
        `- **Fix:** ${tagsAsCode(r.fix_hint)}`,
        `- **Sources:** ${r.meta.sources.map((s) => `[${host(s)}](${s})`).join(", ")} · reviewed ${r.meta.last_reviewed} · [code](${code}/${id})`,
      );
    }
    pages[`${groupPage(module)}.md`] = `${lines.join("\n")}\n`;
  }
  pages["Checks.md"] = `${overview.join("\n")}\n`;
  const unknownGroups = [...new Set(checks.map((c) => moduleOf(c.id)))].filter((m) => !MODULES[m]);
  if (unknownGroups.length) throw new Error(`groups without a wiki page in src/docs.ts: ${unknownGroups.join(", ")}`);

  const value = (v?: string) => (!v ? "empty" : v.includes("${{") ? "workspace" : `\`${v}\``);
  const current = Object.entries(inputs).filter(([, i]) => !i.deprecationMessage);
  const removed = Object.keys(inputs).filter((name) => inputs[name].deprecationMessage);
  pages["Inputs.md"] = [
    generated("action.yml and checks/**/rule.yml"),
    "",
    "Every input is optional; left out or empty it uses its default. The output `result` is `pass`, `warn` or `fail`. First setup: [Getting started](Getting-started).",
    "",
    "| Input | Default | Meaning |",
    "|---|---|---|",
    ...current.map(([name, i]) => `| \`${name}\` | ${value(i.default)} | ${cell(i.description)} |`),
    "",
    ...(removed.length ? [`Removed, ignored with a warning when set: ${removed.map((n) => `\`${n}\``).join(", ")}.`, ""] : []),
    "## What runs when",
    "",
    "Most checks always run. These need a setting; without it they are skipped and the report names the setting.",
    "",
    "| Check | Runs when |",
    "|---|---|",
    "| Website checks | only with a `url` |",
    "| Repository checks | only when `actions/checkout` runs before rechtzeitig |",
    "| Checks of repository and website together | only with a `url` and a checkout |",
    ...checks.flatMap((c) => (c.rule.requires ?? []).map((i) => `| [${cell(c.rule.title)}](${groupPage(moduleOf(c.id))}#${c.rule.id.toLowerCase()}) | ${runsWhen(i)} |`)),
    "",
  ].join("\n");
  return pages;
}

/**
 * JSON Schema of .github/rechtzeitig.yml with every rule id as an enum, so an editor completes ids and marks typos.
 * src/suppress.ts validates the same and more (placeholders, dates in the past); the scan never relies on the schema.
 */
export function suppressionsSchema(checks: LoadedCheck[]): string {
  const limits = loadYaml<Record<string, { min_reason_chars: number; max_expiry_days: number }>>("data/thresholds.yml")["quality/suppressions"];
  const rules = checks.map((c) => c.rule).filter((r) => r.id !== SUPPRESSIONS_RULE).sort((a, b) => a.id.localeCompare(b.id));
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCHEMA_URL,
    title: `rechtzeitig ${SUPPRESSIONS_FILE}`,
    description: `Rules turned off with a category and a reason. They still run and show in the report as suppressed. ${WIKI}/Suppressions`,
    type: "object",
    additionalProperties: false,
    properties: {
      suppress: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rule", "category", "reason"],
          properties: {
            rule: { description: `Rule id, see ${WIKI}/Checks`, enum: rules.map((r) => r.id), markdownEnumDescriptions: rules.map((r) => r.title) },
            category: {
              description: "not-applicable: the duty does not apply to this project. false-positive: the rule is wrong here. accepted-risk: the finding is real and accepted until expires.",
              enum: [...CATEGORIES],
            },
            reason: { description: "Why the rule does not apply or the risk is accepted. Shown in the report.", type: "string", minLength: limits.min_reason_chars },
            expires: { description: `Last day the entry applies (YYYY-MM-DD), at most ${limits.max_expiry_days} days ahead. Required for ${NEEDS_EXPIRY.join(", ")}.`, type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
          allOf: NEEDS_EXPIRY.map((c) => ({ if: { properties: { category: { const: c } } }, then: { required: ["expires"] } })),
        },
      },
    },
  };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/**
 * Every rule that can be turned off, by group, one commented line each with its title, for
 * examples/rechtzeitig.yml. A new rule shows up there after npm run docs; the tests fail until then.
 */
export function exampleRulesYaml(checks: LoadedCheck[]): string {
  const lines: string[] = [];
  for (const [module, [label]] of Object.entries(MODULES)) {
    const rules = checks.filter((c) => moduleOf(c.id) === module && c.rule.id !== SUPPRESSIONS_RULE).map((c) => c.rule).sort((a, b) => a.id.localeCompare(b.id));
    if (!rules.length) continue;
    lines.push(`  # ${label}`, ...rules.map((r) => `  # - rule: ${r.id} # ${r.title.replace(/\s+/g, " ")}`));
  }
  return lines.join("\n");
}

/** Replaces the lines between "# name:start" and "# name:end". */
export function fillYaml(doc: string, name: string, text: string): string {
  const start = doc.match(new RegExp(`^.*# ${name}:start.*$`, "m"));
  const end = doc.match(new RegExp(`^.*# ${name}:end.*$`, "m"));
  if (!start || !end || end.index! < start.index!) throw new Error(`marker # ${name}:start … # ${name}:end is missing`);
  return `${doc.slice(0, start.index! + start[0].length)}\n${text}\n${doc.slice(end.index!)}`;
}

/** Clones the wiki into wiki/, or updates the clone. Generated pages are reset first; pages edited by hand stay. */
function syncWiki(generated: string[]): void {
  const dir = fileURLToPath(WIKI_DIR);
  const git = (...args: string[]) => execFileSync("git", args, { stdio: "inherit" });
  if (!existsSync(new URL(".git", WIKI_DIR))) return void git("clone", "--quiet", `${WIKI.replace(/\/wiki$/, "")}.wiki.git`, dir);
  const tracked = generated.filter((f) => existsSync(new URL(f, WIKI_DIR)));
  if (tracked.length) git("-C", dir, "checkout", "--", ...tracked);
  git("-C", dir, "pull", "--quiet", "--ff-only");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checks = await loadChecks();
  // Maintenance only: a scan loads rules regardless of their age, the docs are not published with a stale one.
  const stale = checks.flatMap((c) => reviewProblems(c.rule).map((p) => `checks/${c.id}/rule.yml: ${p}`));
  if (stale.length) throw new Error(stale.join("\n"));
  writeFileSync(SCHEMA_FILE, suppressionsSchema(checks));
  writeFileSync(EXAMPLE_SUPPRESSIONS, fillYaml(readFileSync(EXAMPLE_SUPPRESSIONS, "utf8"), "rules", exampleRulesYaml(checks)));
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  const pages = wikiPages(checks, loadYaml<{ inputs: Record<string, ActionInput> }>("action.yml").inputs, `v${version}`);
  syncWiki(Object.keys(pages));
  for (const [name, text] of Object.entries(pages)) writeFileSync(new URL(name, WIKI_DIR), text);
  console.log(`examples/rechtzeitig.yml, examples/rechtzeitig.schema.json and ${Object.keys(pages).length} pages in wiki/ updated`);
}

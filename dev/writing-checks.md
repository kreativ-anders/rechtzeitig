# Writing checks

## A new check

1. Create `checks/<category>/<name>/`. The path is the check's id, for example `legal/imprint`. The folder is the group, a legal or topic area (`legal`, `privacy`, `security`, `sustainability`, `accessibility`, and `quality` for rules without a legal basis), never the scan target: a repository check goes into the group its legal basis belongs to, like `security/secrets` or `legal/copyleft-dependencies`. Whether it reads the website or the repository follows from `defineCheck`, `defineRepoCheck` or, for both together, `defineCrossCheck` (its scope, shown on `docs/checks.html`).
2. Add `rule.yml` with the metadata. Titles, legal basis and fix hint in German and English; the report shows them in the chosen language.

   ```yaml
   id: LEG-DE-IMP-001        # SEC, LEG-DE, LEG-EU, A11Y, PRC or SUS, then a topic and a number
   severity: high            # info | low | medium | high | critical
   title:
     de: "Impressum ist verlinkt und erreichbar"
     en: "Imprint is linked and reachable"
   legal_basis:              # optional; rules in checks/quality/ have none and state `value:` (de, en) instead
     de: "§ 5 DDG"
     en: "§ 5 DDG (German Digital Services Act)"
   how: "Finds the imprint link on the start page (`imprint`), loads it and checks status and text."
   fix_hint:
     de: "Impressum auf jeder Seite verlinken."
     en: "Link the imprint from every page."
   requires: [subscriptions]  # optional: inputs the rule needs (SWITCHES in src/rules.ts); skipped without them
   meta:
     last_reviewed: "2026-11-03"
     sources: ["https://www.gesetze-im-internet.de/ddg/__5.html"]
   ```

   A test validates every rule. It fails when `last_reviewed` is older than a year, so legal texts get looked at again (`reviewProblems()` in `src/rules.ts`, also run by `npm run docs`; a scan never checks the age, so a pinned release keeps working), when `sources` is empty, when a source is not on a domain in `data/source-domains.yml` (primary sources only: laws, courts, authorities, standards, vendor docs), and when `how` does not name a `data/*.yml` file that `check.ts` loads. A check that needs data from an API with a token is opt-in: list the input in `requires` (known inputs: `SWITCHES` in `src/rules.ts`, each an `action.yml` input with a `messages.common.switch_<input>` text; a new one also needs an option in `src/options.ts`, a row in `docs/workflow.html`, a line in the example workflow, set in `with:` or commented with its default and named in `FILE_ONLY`, which `src/inputs.test.ts` checks). Without the secret the runner skips the rule and the crawler sends nothing to that service. A rule without `legal_basis` still cites a standard or official guideline for its claim. To review sources and look for changes, use the Claude Code skill `.claude/skills/review-sources/` (`/review-sources`). To check that `rule.yml` and its sources match what `check.ts` does, use `.claude/skills/check-rule-docs/` (`/check-rule-docs`). Both take an optional rule id or module. `npm run drift`, also a CI job, fails for a commit that changes `check.ts` or the rule's messages in `lang/` without its `rule.yml`, or a data file without naming it in the message; when the docs really stay the same, add a line `Docs-unchanged: <reason>` to the commit message.

3. Add `check.ts` with the detection:

   ```ts
   import { defineCheck, fail, msg, pass } from "../../../src/sdk.ts";

   export default defineCheck({
     run(ctx) {
       const found = ctx.legalPage("imprint");
       if (!found) return fail(msg("no_link"));
       return pass(msg("found", { where: ctx.short(found.link.href ?? "") }));
     },
   });
   ```

   A check returns message keys, never sentences. The sentences go into every `lang/<code>.yml` under `messages.<check id>` (here `messages.legal/imprint`), with `{name}` for parameters and `one`/`other` when a `count` parameter decides the plural. Keys that several checks share live in `messages.common`. A parameter can itself be a `msg(...)`, for words that need translating. Details are findings: `{ file, line, key, params }` for places in the repository (GitHub shows them as annotations in pull requests), `{ text }` for values shown as they are (URLs, hosts, cookie names). The test helpers render every result in every language, so a missing key fails the test.

   A repository check uses `defineRepoCheck` and gets `repo` instead of `ctx`: `repo.files`, `repo.find(pattern)` (for example `repo.find(WORKFLOWS)`), `repo.read(path)`, `repo.yaml(path)` for YAML or JSON, and the locked `repo.components`.

   A check that needs both uses `defineCrossCheck` and gets `run(ctx, repo)`. It runs only when a URL and a checkout exist; the runner skips it otherwise and says which side is missing. Use it for what one side alone cannot show, and keep it sharp: a finding needs evidence from both sides, and a file it could not read (`repo.coverage`, `ctx.codeSkipped`) gives `info`, never a pass. Shared helpers: `directPackages(repo)`, `ownFiles(repo)`, `grepFiles(repo, files, patterns)`, `consentInRepo(repo)`, `consentOnSite(ctx)`, `ctx.matches(concept, text)`, `ctx.vendors`, `findSecrets(text)`, `databaseRules(repo)`, `siteCode(ctx)`, `hostsIn(ctx, domains)`, `ctx.packageVendor(name)`, `ctx.sourceMaps`. Test it with `runCrossCheck(here, "fixture" or a context from siteFromFiles(), { "path/file": "content" })`.

4. Add `test.ts` and, for website checks, `fixtures/<case>/index.html` (plus more pages if needed). Each case is a tiny website. Cover one case that passes and one that does not.

   ```ts
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { runCheck } from "../../../test/helpers.ts";

   const here = import.meta.dirname;

   test("passes when the imprint is linked", async () => {
     assert.equal((await runCheck(here, "good")).status, "pass");
   });
   ```

   For data a local fixture cannot produce (TLS, DNS, redirects), use `fakeContext()`. For repository checks, use `runRepoCheck(here, { "path/file": "content" })`.

5. Run `npm run docs` to update `docs/checks.html`. A test fails if you forget. Keep `how` in `rule.yml` true whenever `check.ts` changes.
6. Run `npm run typecheck && npm test`.

The runner finds the check by itself. Nothing else needs to change.

## Rules

- Import only from `src/sdk.ts`. It has the types, the helpers and the context docs.
- Return exactly one result: `pass`, `warn`, `fail`, `info` or `skip`. A check that throws or returns nothing shows up as `error`.
- Use `fail` when you are sure, `warn` when a heuristic may be wrong, `info` when a person has to judge, `skip` when the check does not apply.
- Put evidence in `details`: the page, the host, the file and line. A reader should be able to fix the problem from the report alone.
- No network access in checks. The crawler and the repository scan have already collected everything.
- Keep secret-looking strings out of the repository, also in tests: build them at runtime (`["sk", "live", noise(24)].join("_")`, see `checks/security/secrets/test.ts`). A body of one repeated character is a placeholder and no longer counts as a secret.

## What the website context gives you

| Field or helper | Content |
|---|---|
| `ctx.start`, `ctx.pages` | Visited pages. Each has `noJs` and `js` snapshots: status, headers, `meta` (header equivalents from `<meta>`), text, links, forms, checkboxes, requests, cookies |
| `ctx.url`, `ctx.https`, `ctx.domain` | Final URL of the start page, whether it is HTTPS, its registrable domain |
| `startLinks(ctx, concept?)`, `startCheckboxes(ctx)` | Links and checkboxes of the start page, both loads, without duplicates |
| `startSnapshot(ctx)` | The start page as the server sent it. Use it for status, headers, `meta` and `lang` |
| `ctx.sitePages` | Pages of the site itself whose load with JavaScript succeeded, for what the rendered page shows |
| `ctx.observedPages`, `siteRequests(ctx)`, `siteCookies(ctx)` | Pages where at least one load succeeded, and their requests and cookies (once per name and domain) |
| `ctx.jsFailed`, `jsFailedPages(ctx)` | Pages whose load with JavaScript failed; a check that passes on missing evidence warns instead and lists them |
| `thirdPartyServices(ctx)` | Other sites contacted, grouped by vendor (else by domain), with hosts and pages |
| `ctx.legalPage("imprint")`, `needLegalPage(ctx, "privacy")` | Link on the start page and the page behind it; `needLegalPage` returns the skip result when it did not load |
| `LEGAL_PAGES`, `linkedPageResult`, `requiredButton` | Shared logic of the imprint/privacy and cancellation/withdrawal rules |
| `ctx.links(concept, snapshotOrLinks)` | Links whose label matches a concept from `lang/*.yml` |
| `ctx.says(concept, text)` | Text contains a concept from `lang/*.yml` |
| `ctx.probes`, `ctx.tls`, `ctx.dns`, `ctx.http`, `ctx.variant`, `ctx.countries` | Lookups without a browser |
| `ctx.vendor(host)`, `ctx.trackingCookie(name)` | Entry from `data/third-parties.yml` |
| `axeResult(ctx, rules)` | Result of the axe-core `rules` on all own pages (`js.axe`): skip, pass or warn with page and selector |

## Data files

| File | Add here |
|---|---|
| `lang/<code>.yml` | Words. `links` concepts match link and button labels (the crawler opens matching links); `text` concepts match page text. Patterns run on normalized text: lowercase, `ä→ae ö→oe ü→ue ß→ss`. A new language is a new file with the same keys; a test checks this. Add the code to `examples/workflows/rechtzeitig.yml`. |
| `data/third-parties.yml` | A service: hosts, country, whether it needs consent, how a privacy policy names it, its cookies, advice in every report language (`de`, `en`; the loader rejects a missing one). |
| `data/probes.yml` | A path to request. `kind: file` with an `expect` pattern for files that must not be public, `kind: error` for error pages, `kind: public` for files that should be public and a check reads (`security.txt`). |
| `data/secrets.yml` | A secret pattern with `fail` or `warn` under `rules`, with `keywords` (lowercase, the line must contain one), a group named `secret`, and `entropy: token` (or `generic`) so placeholders drop out. With `allow`, a documented example; with `payload`, match group 1 is decoded as a JWT payload and must have the listed claims. A pattern adapted from gitleaks (MIT) is fine, it is named in `NOTICE`; never take detectors from AGPL projects such as trufflehog. |
| `data/accessibility.yml` | An axe-core rule id for one of the accessibility checks. Only rules that map to one WCAG success criterion and rarely misfire. |
| `data/licenses.yml` | A license pattern under a family in one of the categories `source_available`, `network_copyleft`, `copyleft`, `weak_copyleft`, `permissive`; a new family needs its message in the rule's `lang/*.yml` messages. |
| `data/relicensing.yml`, `data/ai-models.yml` | A license change (package, ecosystem, first version, old and new license, fork, source) or an AI model (id and file patterns, license, kind, source). Only entries checked against a primary source. |
| `data/update-tools.yml` | A Dependabot ecosystem name, a Renovate config path or a vulnerability scanner. |
| `data/countries.yml`, `data/cookies.yml`, `data/leaks.yml`, `data/outdated-links.yml`, `data/outdated-laws.yml`, `data/hsts-preload.yml`, `data/subresource-integrity.yml`, `data/file-formats.yml`, `data/google-tags.yml`, `data/shop.yml`, `data/workflow-risks.yml` | Country groups, cookie name patterns, error page traces and version headers, links to closed services, repealed law names, HSTS-preloaded top-level domains, hosts whose files change under the same URL, file formats, Google tag endpoints and consent parameters, price and address field formats for the shop checks, risky workflow patterns. |
| `data/thresholds.yml` | A number a check decides by (limit, ratio, days), in the section named after the check's path, e.g. `security/tls`. Never a constant in `check.ts`. Lists in a finding go through `capped()`, which keeps `common.max_listed` items and adds `more`. |
| `src/repo/lockfiles.ts` | A lockfile parser: one function plus one entry in `LOCKFILES`; its manifest in `MANIFESTS`. |

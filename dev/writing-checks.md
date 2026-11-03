# Writing checks

## A new check

1. Create `checks/<category>/<name>/`. The path is the check's id, for example `legal/imprint`. Repository checks go in `checks/repo/`.
2. Add `rule.yml` with the metadata. Titles, legal basis and fix hint in German and English; the report shows them in the chosen language.

   ```yaml
   id: LEG-DE-IMP-001        # SEC, LEG-DE, LEG-EU, A11Y, PRC or SUS, then a topic and a number
   severity: high            # info | low | medium | high | critical
   title:
     de: "Impressum ist verlinkt und erreichbar"
     en: "Imprint is linked and reachable"
   legal_basis:              # optional
     de: "§ 5 DDG"
     en: "§ 5 DDG (German Digital Services Act)"
   how: "Finds the imprint link on the start page (`imprint`), loads it and checks status and text."
   fix_hint:
     de: "Impressum auf jeder Seite verlinken."
     en: "Link the imprint from every page."
   meta:
     last_reviewed: "2026-11-03"
     sources: ["https://www.gesetze-im-internet.de/ddg/__5.html"]
   ```

   A test validates every rule. It fails when `last_reviewed` is older than a year, so legal texts get looked at again.

3. Add `check.ts` with the detection:

   ```ts
   import { defineCheck, fail, pass } from "../../../src/sdk.ts";

   export default defineCheck({
     run(ctx) {
       const found = ctx.legalPage("imprint");
       if (!found) return fail("No link to the imprint on the start page.");
       return pass(`Imprint found at ${ctx.short(found.link.href ?? "")}.`);
     },
   });
   ```

   A repository check uses `defineRepoCheck` and gets `repo` instead of `ctx`.

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
- Keep secret-looking strings out of the repository, also in tests: build them at runtime (`["sk", "live", "x".repeat(24)].join("_")`).

## What the website context gives you

| Field or helper | Content |
|---|---|
| `ctx.start`, `ctx.pages` | Visited pages. Each has `noJs` and `js` snapshots: status, headers, `meta` (header equivalents from `<meta>`), text, links, forms, checkboxes, requests, cookies |
| `ctx.url`, `ctx.https`, `ctx.domain` | Final URL of the start page, whether it is HTTPS, its registrable domain |
| `startLinks(ctx, concept?)`, `startCheckboxes(ctx)` | Links and checkboxes of the start page, both loads, without duplicates |
| `startSnapshot(ctx)` | The start page as the server sent it. Use it for status, headers, `meta` and `lang` |
| `ctx.sitePages`, `siteRequests(ctx)`, `siteCookies(ctx)` | Pages, requests and cookies (once per name and domain) of the site itself |
| `thirdPartyServices(ctx)` | Other sites contacted, grouped by vendor (else by domain), with hosts and pages |
| `ctx.legalPage("imprint")`, `needLegalPage(ctx, "privacy")` | Link on the start page and the page behind it; `needLegalPage` returns the skip result when it did not load |
| `LEGAL_PAGES`, `linkedPageResult`, `requiredButton` | Shared logic of the imprint/privacy and cancellation/withdrawal rules |
| `ctx.links(concept, snapshotOrLinks)` | Links whose label matches a concept from `lang/*.yml` |
| `ctx.says(concept, text)` | Text contains a concept from `lang/*.yml` |
| `ctx.probes`, `ctx.tls`, `ctx.dns`, `ctx.http`, `ctx.variant`, `ctx.countries` | Lookups without a browser |
| `ctx.vendor(host)`, `ctx.trackingCookie(name)` | Entry from `data/third-parties.yml` |

## Data files

| File | Add here |
|---|---|
| `lang/<code>.yml` | Words. `links` concepts match link and button labels (the crawler opens matching links); `text` concepts match page text. Patterns run on normalized text: lowercase, `ä→ae ö→oe ü→ue ß→ss`. A new language is a new file with the same keys; a test checks this. Add the code to `examples/workflows/rechtzeitig.yml`. |
| `data/third-parties.yml` | A service: hosts, country, whether it needs consent, how a privacy policy names it, its cookies, advice. |
| `data/probes.yml` | A path to request. `kind: file` with an `expect` pattern for files that must not be public, `kind: error` for error pages. |
| `data/secrets.yml` | A secret pattern with `fail` or `warn`. |
| `data/countries.yml`, `data/cookies.yml`, `data/leaks.yml`, `data/outdated-links.yml` | Country groups, cookie name patterns, error page traces and version headers, links to closed services. |
| `src/repo/lockfiles.ts` | A lockfile parser: one function plus one entry in `LOCKFILES`. |

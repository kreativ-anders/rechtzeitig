# Writing checks

## A new check

1. Create a folder `checks/<category>/<name>/`. The path is the check's id, for example `legal/imprint`.
2. Add `check.ts`:

   ```ts
   import { defineCheck, fail, pass } from "../../../src/sdk.ts";

   export default defineCheck({
     title: "Imprint is linked and reachable",
     law: "§ 5 DDG",
     run(ctx) {
       const found = ctx.legalPage("imprint");
       if (!found) return fail("No link to the imprint on the start page.");
       return pass(`Imprint found at ${ctx.short(found.link.href ?? "")}.`);
     },
   });
   ```

3. Add `fixtures/<case>/index.html` (and more pages if the case needs them). Each case is a tiny website. Have at least one case that passes and one that does not.
4. Add `test.ts`:

   ```ts
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { runCheck } from "../../../test/helpers.ts";

   const here = import.meta.dirname;

   test("passes when the imprint is linked", async () => {
     assert.equal((await runCheck(here, "good")).status, "pass");
   });
   ```

5. Add a row to the table in the README. A test fails if you forget.
6. Run `npm test` and `npm run typecheck`.

The runner finds the check by itself. Nothing else needs to change.

## Rules

- Import only from `src/sdk.ts`. It has the types, the result helpers and the `ScanContext` docs.
- Return exactly one result: `pass`, `warn`, `fail`, `info` or `skip`. A check that throws or returns nothing shows up as `error`.
- Use `fail` when you are sure, `warn` when a heuristic may be wrong, `info` when a person has to judge, `skip` when the check does not apply.
- Put evidence in `details`: the page, the host, the missing item. A reader should be able to fix the problem from the report alone.
- No network access. The crawler has already loaded everything; read it from `ctx`.

## What `ctx` gives you

| Field or helper | Content |
|---|---|
| `ctx.start`, `ctx.pages` | Visited pages. Each has `noJs` and `js` snapshots: status, headers, text, links, requests, cookies |
| `ctx.sitePages` | Pages on the site itself. Use these for requests and cookies |
| `ctx.legalPage("imprint")` | Link on the start page and the page behind it |
| `ctx.links(concept, snapshot)` | Links whose label matches a concept from `lang/*.yml` |
| `ctx.says(concept, text)` | Text contains a concept from `lang/*.yml` |
| `ctx.vendor(host)`, `ctx.trackingCookie(name)` | Entry from `data/third-parties.yml` |
| `ctx.isThirdParty(host)`, `ctx.short(url)` | Small helpers |

`fakeContext()` in `test/helpers.ts` builds a context by hand for cases a local fixture cannot show, such as HTTPS redirects.

## Words: lang/*.yml

Checks never contain words of a natural language. They ask for a concept (`imprint`, `storage_period`) and the language file holds the patterns.

- `links` concepts match link and button labels. The crawler opens every link that matches.
- `text` concepts match page text.
- Patterns are regular expressions matched against normalized text: lowercase, `ä→ae ö→oe ü→ue ß→ss`, single spaces. Write `kuendigen`, not `kündigen`.

A new language is a new file, for example `lang/fr.yml`, with the same keys as the others. A test checks that all files define the same concepts and that every pattern compiles. Add the code to the `language` options in `examples/workflows/vibecoda.yml`.

## Services: data/third-parties.yml

One entry per vendor: hosts, purpose, whether it needs consent, how a privacy policy names it, its cookies and advice for the report. Add a vendor there and every privacy check knows it.

# Checks

One folder per rule: `rule.yml`, `check.ts`, `test.ts`, `fixtures/`. How to write one: `dev/writing-checks.md`.

When you touch a check, in the same change:

1. `rule.yml` `how` still describes in one sentence what `check.ts` does. If not, rewrite it.
2. Changed legal reasoning or wording: update `legal_basis`, `fix_hint` (de and en), `meta.sources`, `meta.last_reviewed`.
3. A new behavior has a test case with a fixture that passes and one that does not.
4. `npm run docs` regenerates `docs/checks.html`.
5. `npm run typecheck && npm test` passes.

`check.ts` imports only `src/sdk.ts`, does no network access, and returns exactly one result.

## Rules without a legal basis

`checks/quality/` holds checks that have no legal basis but help the project (tests that can fail, CI that blocks, no placeholder code). Their `rule.yml` has no `legal_basis` and states `value` (de and en): why the rule is worth running, in one sentence. `src/rules.ts` rejects a quality rule without `value`, and any rule with both. Cards, report and SARIF show it as "No legal basis: <value>". Sources are still required: studies, CWE or OWASP pages, tool docs.

## Code checks

Checks that read source code use `codeFiles()`, `findInCode()` and `codeResult()` from `src/sdk.ts`: languages, skipped paths (vendored, built, docs, examples, fixtures), tests and browser files come from `data/code-paths.yml`, patterns from `data/insecure-code.yml` (security) or `data/code-quality.yml` (quality). Every new pattern gets a case in `test/benchmark/` (see CONTRIBUTING.md).

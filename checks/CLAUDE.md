# Checks

One folder per rule: `rule.yml`, `check.ts`, `test.ts`, `fixtures/`. How to write one: `dev/writing-checks.md`.

When you touch a check, in the same change:

1. `rule.yml` `how` still describes in one sentence what `check.ts` does. If not, rewrite it.
2. Changed legal reasoning or wording: update `legal_basis`, `fix_hint` (de and en), `meta.sources`, `meta.last_reviewed`.
3. A new behavior has a test case with a fixture that passes and one that does not.
4. `npm run docs` regenerates `docs/checks.md`.
5. `npm run typecheck && npm test` passes.

`check.ts` imports only `src/sdk.ts`, does no network access, and returns exactly one result.

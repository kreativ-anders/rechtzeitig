---
name: check-rule-docs
description: Check that each rechtzeitig rule's documentation (rule.yml how, legal_basis, fix_hint, meta.sources, docs/checks.html) matches what its check.ts actually does, and that every claim is backed by a cited primary source. Use when asked whether code and docs still agree, to audit rules for missing or unfitting sources, after changing check.ts, lang/*.yml or data/*.yml, or before a release.
---

# Check rule docs against code

Finds places where `checks/<module>/<name>/rule.yml` and `docs/checks.html` say something different from what `check.ts` does, and claims without a fitting source. `review-sources` asks "did the law change?". This skill asks "does the documentation describe the code, and does each source support it?". The result is a report first. Files change only after the user agrees.

## Scope

- No argument: all rules.
- A rule id, folder or module (`sustainability`, `legal`, ...): only those.
- After a code change: the rules whose `check.ts`, or whose `lang/` or `data/` files, appear in `git diff`.

## What the tests already catch

`npm test` fails when a rule has no source, cites a domain outside `data/source-domains.yml`, was reviewed more than a year ago, `how` does not name a `data/*.yml` file that `check.ts` loads, or `docs/checks.html` is stale. Run `npm test` first and do not repeat these checks by hand. This skill covers what a test cannot judge.

## For each rule

Read `rule.yml`, `check.ts`, `test.ts`, and the `src/sdk.ts` helpers that `check.ts` calls (for example `startLinks`, `legalPage`, `thirdPartyServices`, `MIN_TEXT`).

1. **how vs. code.** Does `how` name what the check looks at (pages, headers, files), the thresholds and constants (`MIN_SHARE = 0.2` means "less than 20 %"), the `lang/*.yml` concepts, and the data files, including the ones the sdk helpers load (`data/third-parties.yml`, `data/probes.yml`)? Is anything in `how` that the code does not do?
2. **Result vs. severity.** Does the check return `fail` only where a duty can be broken, and `warn` or `info` for hints? Does the severity fit that?
3. **legal_basis vs. code.** Does every page or obligation the check tests have a norm? A check that tests imprint and privacy policy needs a norm for both (§ 5 DDG and Art. 12 GDPR). Does a cited norm cover something the check does not test?
4. **No legal duty.** A rule without `legal_basis` shows "Technical, no single law" in the docs. It still needs a source for its claim: a standard or official guideline (W3C, BSI, ENISA, ETSI, RFC). Do not cite a policy that does not state the claim, such as the European Green Deal for JavaScript. A source that does not say it is no evidence.
5. **sources vs. claims.** Open each source (WebFetch; `curl` into the scratchpad for anchors and PDFs). Confirm that the cited article, section or anchor exists and says what `legal_basis`, `how` or the check messages claim. Prefer deep links (`#anchor`, `__5.html`) over a homepage.
6. **fix_hint vs. messages.** Do `fix_hint` (de and en) and the hints in `check.ts` say the same thing? Does `fix_hint` promise something no source backs ("faster", "required by law")?
7. **Tests.** Does `test.ts` have a passing and a non-passing fixture for every branch that changes the status?

## Report

One table per module:

| Rule | Field | Problem | Evidence | Proposal |
|---|---|---|---|---|
| `SUS-JS-002` | meta.sources | empty | no source for "content should work without JS" | W3C WSG `#progressive-enhancement`, `#static-over-dynamic` |

Field is one of `how`, `severity`, `legal_basis`, `sources`, `fix_hint`, `tests`. Evidence quotes the code (`file:line`) or the source. End with the rules that showed no problems.

Findings are technical risk hints, not legal advice. Say so when a question needs a lawyer.

## Applying changes

Only after the user agrees, and following `CLAUDE.md` and `checks/CLAUDE.md`:

1. Fix `rule.yml`. Change `check.ts` only if the user wants the code to follow the docs, not the other way round.
2. Set `meta.last_reviewed` to today only for rules whose sources you opened and confirmed.
3. A new source domain goes into `data/source-domains.yml` with a reason in the commit message, never silently.
4. If you find a mismatch that a test could catch, propose that test.
5. Run `npm run docs && npm run typecheck && npm test` (on macOS with `caffeinate -i`).
6. Commit with a message that lists each changed rule id and field.

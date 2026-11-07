---
name: review-sources
description: Review the legal basis and sources of rechtzeitig rules against primary sources and look for changes since the last review (amendments, new rulings, authority guidance). Use when asked to review, check or update rule sources, legal references or last_reviewed dates, or for the periodic legal review of checks/**/rule.yml.
---

# Review rule sources

Checks that every rule in `checks/<module>/<name>/rule.yml` still cites correct, current, official sources, and finds what changed since `meta.last_reviewed`. The result is a report first; files change only after the user agrees.

## Scope

- No argument: all rules, oldest `meta.last_reviewed` first.
- A rule id, folder or module (`legal`, `privacy`, `repo`, ...): only those.

List the rules with their review date:

```sh
grep -H "last_reviewed" checks/*/*/rule.yml | sort -t'"' -k2
```

## Allowed sources

Only primary sources from `data/source-domains.yml`: laws and official journals, courts, authorities, standards bodies, and a vendor's own documentation for technical facts about its product. The rule validator rejects any other domain, so `npm test` fails.

- Never cite blogs, law firm articles, news sites, private websites or AI summaries. They may help to find a primary source, nothing more.
- If an official source is on a domain that is missing from the list, propose adding the domain and say why. Do not add it silently.
- Prefer the most stable official URL that does not redirect: ELI or CELEX links on EUR-Lex (EU court judgments as `?uri=CELEX:6<year>CJ<number>`, `TJ` for the General Court; `curia.europa.eu/juris/liste.jsf` now redirects), `gesetze-im-internet.de/<law>/__<section>.html`, press releases or decisions on the court's own site.

## For each rule

1. Read `rule.yml`: `legal_basis` (de and en), `fix_hint`, `meta.sources`, `meta.last_reviewed`. Read `how` and `check.ts` only as far as needed to know what the rule claims.
2. Open every source (WebFetch; for PDFs save the file and extract the text). Record:
   - reachable or not, and the final URL after redirects;
   - for laws: current version and date of the last change, whether the cited article, paragraph, point or threshold still says what the rule claims;
   - for EU acts: in force, amended, corrected or repealed; application dates (for example CRA Art. 71);
   - for rulings: court, case number, date, and whether an appeal or a later ruling changed it;
   - for standards: the version that applies and whether a newer one is cited officially.
3. Search for changes since `meta.last_reviewed`: amendments of the cited norms, new rulings of the ECJ, the General Court, the BGH or higher regional courts on the same question, and guidance of the authorities in `data/source-domains.yml` (EDPB, DSK, BfDI, BSI, ENISA, Bundesfachstelle Barrierefreiheit). Use web search to find leads, then confirm each lead on a primary source.
4. Compare: do `legal_basis`, `fix_hint` and severity still match the sources? Note dates in the future (rules that apply later) and dates that have passed.

## Report

Give one table per module, then the proposals:

| Rule | Source | Status | Evidence | Proposal |
|---|---|---|---|---|
| `LEG-EU-ODR-001` | eur-lex.europa.eu/eli/reg/2024/3228/oj | ok | Art. 2: ODR Regulation repealed from 20 July 2025 | none |

Status is one of `ok`, `changed`, `broken link`, `new source`, `unclear`. Evidence is a short quote or a precise reference (article, paragraph, margin number) from the primary source, never a paraphrase from a secondary site. `unclear` means a human should decide; say what is open.

Findings are technical risk hints, not legal advice. Say so when a question needs a lawyer.

## Applying changes

Only after the user agrees, and following `checks/CLAUDE.md`:

1. Update `legal_basis` (de and en), `fix_hint` (de and en) and `meta.sources` as needed. Changed wording or thresholds may also need `lang/*.yml` or `data/` changes and a test.
2. Set `meta.last_reviewed` to today only for rules whose every source was opened and checked. A rule with an `unclear` point keeps its old date.
3. Run `npm run docs && npm run typecheck && npm test`. On macOS run the tests with `caffeinate -i` so sleep does not break the timing tests.
4. Commit with a message that lists every reviewed rule id and every changed source, so the review can be traced in the git history.

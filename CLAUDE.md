# rechtzeitig

GitHub Action that scans a website and its repository for German legal basics, security and an SBOM. Read README.md, then dev/architecture.md.

## Where things live

| What | File |
|---|---|
| One rule | `checks/<module>/<name>/`: `rule.yml` (metadata), `check.ts` (detection), `test.ts`, `fixtures/` |
| List of all rules with how they are checked | `docs/checks.html`, generated from `rule.yml` by `npm run docs` |
| Words per language | `lang/*.yml` |
| Known services, countries, cookies | `data/third-parties.yml` |
| Paths requested without a browser | `data/probes.yml` |
| Secret patterns | `data/secrets.yml` |
| License groups, update tools | `data/licenses.yml`, `data/update-tools.yml` |
| Lists for single checks (countries, cookie names, error traces, closed services) | `data/*.yml` |
| Lockfile parsers | `src/repo/lockfiles.ts` |
| Allowed source domains for `meta.sources` | `data/source-domains.yml` |
| Periodic review of rule sources | `.claude/skills/review-sources/` |
| Check that rule docs and sources match the code | `.claude/skills/check-rule-docs/` |
| Inputs of the action | `action.yml`, documented in `docs/workflow.html` |

## Keep the documentation true

Every change that affects what a rule does updates its documentation in the same commit:

- Detection changed in `check.ts` → update `how` in `rule.yml` (one sentence, names the data files used).
- Legal basis, wording or threshold changed → update `legal_basis`, `fix_hint`, `meta.sources`, and set `meta.last_reviewed` to today.
- Rule added, removed or renamed → `rule.yml` with a new unique id, then `npm run docs`.
- Data file changed in a way that changes results (new vendor, pattern, probe) → mention it in the commit message.
- Input added or changed → `action.yml`, `examples/workflows/rechtzeitig.yml`, `docs/workflow.html`.
- Architecture changed → `dev/architecture.md`.

Then run `npm run docs && npm run typecheck && npm test`. Tests fail when `docs/checks.html` is stale, a rule is invalid, has no source, is older than a year, or its `how` misses a data file its `check.ts` loads. For what tests cannot judge, use the `check-rule-docs` skill.

## Boundaries

- Words belong in `lang/*.yml`, services and patterns in `data/`, never in check code.
- No paid features or paid code paths in this repository.
- Findings are technical risk hints with location and legal basis, never legal advice.
- A check that asks an outside service only uses that service's official API. With a token, the check is opt-in: it runs only when the user sets the secret. An official API without a token may be on by default, but needs an input to turn it off, documented in `docs/workflow.html` ("What runs when", "Data that leaves the runner"). Both kinds are listed in `SWITCHES` in `src/rules.ts` and named in the rule's `requires`. No unofficial endpoints, no scraping, no fallback that sends data without a token.
- Commercialization plans go into the section "Commercialization" of `dev/roadmap.md`, nowhere else. No prices or competitor names.
- Docs are English, short and plain. `docs/` is for users (GitHub Pages), `dev/` for contributors.

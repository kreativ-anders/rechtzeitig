# vibecoda

GitHub Action that scans a website and its repository for German legal basics, security and an SBOM. Read README.md, then dev/architecture.md.

## Where things live

| What | File |
|---|---|
| One rule | `checks/<module>/<name>/`: `rule.yml` (metadata), `check.ts` (detection), `test.ts`, `fixtures/` |
| List of all rules with how they are checked | `docs/checks.md`, generated from `rule.yml` by `npm run docs` |
| Words per language | `lang/*.yml` |
| Known services, countries, cookies | `data/third-parties.yml` |
| Paths requested without a browser | `data/probes.yml` |
| Secret patterns | `data/secrets.yml` |
| Lockfile parsers | `src/repo/lockfiles.ts` |
| Inputs of the action | `action.yml`, documented in `docs/workflow.md` |

## Keep the documentation true

Every change that affects what a rule does updates its documentation in the same commit:

- Detection changed in `check.ts` → update `how` in `rule.yml` (one sentence, names the data files used).
- Legal basis, wording or threshold changed → update `legal_basis`, `fix_hint`, `meta.sources`, and set `meta.last_reviewed` to today.
- Rule added, removed or renamed → `rule.yml` with a new unique id, then `npm run docs`.
- Data file changed in a way that changes results (new vendor, pattern, probe) → mention it in the commit message.
- Input added or changed → `action.yml`, `examples/workflows/vibecoda.yml`, `docs/workflow.md`.
- Architecture changed → `dev/architecture.md`.

Then run `npm run docs && npm run typecheck && npm test`. Tests fail when `docs/checks.md` is stale, a rule is invalid or older than a year.

## Boundaries

- Words belong in `lang/*.yml`, services and patterns in `data/`, never in check code.
- Paid features never go into the engine; `tier: pro` rules never go into this repository.
- Findings are technical risk hints with location and legal basis, never legal advice.
- No business plans, prices or competitor names in this repository.
- Docs are English, short and plain. `docs/` is for users (GitHub Pages), `dev/` for contributors.

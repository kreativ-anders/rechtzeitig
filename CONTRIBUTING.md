# Contributing

Thanks for helping. This page lists what a change needs before it can be merged. How the code works: [dev/architecture.md](dev/architecture.md). How to write a check: [dev/writing-checks.md](dev/writing-checks.md).

Security issues go to [SECURITY.md](SECURITY.md), not to a public issue or pull request.

## Workflow

- Every change goes through a pull request. `main` accepts no direct pushes and no force pushes.
- A pull request can be merged when the checks `test` and `drift` are green.
- One topic per pull request. Small is better.
- Commit messages start with a [gitmoji](https://gitmoji.dev/) and say what changes, for example `✨ Check for a vulnerability contact`.

## Before you push

```sh
npm ci
npm run docs && npm run typecheck && npm test
npm run drift
```

## Keep the documentation true

A change that affects what a rule does updates its documentation in the same commit. `npm run drift` and the tests catch most of it.

| You changed | Also change |
|---|---|
| Detection in `checks/<module>/<name>/check.ts` | `how` in that `rule.yml` (one sentence, names the data files it loads) |
| Messages of a rule in `lang/*.yml` | that `rule.yml` |
| Legal basis, wording or threshold | `legal_basis`, `fix_hint`, `meta.sources`, and `meta.last_reviewed` set to today |
| A rule added, removed or renamed | `rule.yml` with a new unique id, then `npm run docs` |
| A file in `data/` in a way that changes results | name the file in the commit message |
| An input of the action | `action.yml`, `src/options.ts`, `examples/workflows/rechtzeitig.yml` and `.github/workflows/rechtzeitig.yml` (Run workflow dialog, or `FILE_ONLY` in `src/inputs.test.ts`), `docs/workflow.html` |
| The architecture | `dev/architecture.md` |

When a commit really leaves the docs as they are, add a line `Docs-unchanged: <reason>` to its message.

## Boundaries

- Words go into `lang/*.yml`, services and patterns into `data/`, numbers a check decides by into `data/thresholds.yml`, never into check code.
- Sources in `meta.sources` are primary sources only (laws, courts, authorities, standards, vendor docs) on a domain listed in `data/source-domains.yml`.
- Checks make no network requests. A check that asks an outside service uses only its official API. With a token it is opt-in, without a token it needs an input to turn it off. Both are documented in `docs/workflow.html`.
- No paid features or paid code paths.
- Findings are technical risk hints with location and legal basis, never legal advice.
- Keep secret-looking strings out of the repository, also in tests. Build them at runtime.
- Docs are English, short and plain. `docs/` is for users, `dev/` for contributors.

## License

By contributing you agree that your contribution is licensed under [Apache-2.0](LICENSE).

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

## Tests that catch bugs

A rule's `test.ts` expects a pass, at least one other status, and every status its `check.ts` returns (`src/check-tests.test.ts`). Every word pattern in `lang/*.yml` has an example in `src/lang-examples.test.ts`.

To see whether the tests of a rule notice a wrong change, run the mutation test:

```sh
npm run mutate -- legal/imprint        # one rule; without a name every rule (about 15 minutes)
```

It changes one thing at a time in what the rule decides by (a comparison, a status, a regex alternative, a word pattern, a data entry, a threshold) and runs the rule's tests on a copy. Each change that "survived" is printed: add a test that fails for it, or leave it when the change means the same.

## Benchmark of the code checks

`test/benchmark/` holds two sets, scored separately:

- `fixtures/real/`: excerpts of public repositories (AI-built apps, starter templates, maintained reference projects). This is the evidence.
- `fixtures/synthetic/`: code as coding agents write it for everyday prompts, written together with the patterns. Its score is an upper bound.

`npm test` runs every repository check on every case and fails when a rule in `SCORED` (`test/benchmark/run.ts`) falls below `benchmark.min_precision` or `min_recall` in `data/thresholds.yml` on either set. A rule that cannot reach the minimum on the real set gets an entry in `benchmark.real_exceptions` with the value it reaches and why; the test fails once the rule reaches the minimum again, so the entry has to go. `npm run benchmark` prints both tables.

### A real case

1. Take the code from a public repository whose license allows copying an excerpt into this Apache-2.0 repository: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, CC0-1.0, 0BSD or Unlicense (`LICENSES` in `run.ts`). No license, NOASSERTION or copyleft: leave it.
2. Pin the commit SHA and keep the original paths. Take the relevant file or lines plus the context a check needs (a `vite.config.ts` next to `src/`, the pytest config); record line ranges in `source.paths`.
3. Label it by reading the code, before you run the checks, and write why in `label`. Label the risk, not what the rule happens to do. Do not drop a case after seeing the result.
4. Never commit a credential: replace a real key with `{{key:<length>:<seed>}}` of the same length.
5. Add the repository to the list in `NOTICE`.

```yaml
source:
  repo: https://github.com/<owner>/<repo>
  commit: <40 hex characters>
  license: MIT
  copyright: "Copyright (c) 2025 Jane Doe"     # as the license file names it
  paths:
    src/lib/openai.ts: "src/lib/openai.ts (lines 1-20)"
label: >-
  The OpenAI client in the Vite bundle reads VITE_OPENAI_API_KEY, so the key ships to every visitor.
expect: [security/llm-key-in-browser]
files:
  src/lib/openai.ts: |2
    ...
```

### A synthetic case

Create `test/benchmark/fixtures/synthetic/<name>.yml`:

```yaml
prompt: "Add a chat with OpenAI to my Vite app"   # what the agent was asked
expect: [security/llm-key-in-browser]            # rules that must warn, fail or note; [] for a clean case
files:
  src/lib/openai.ts: |
    export const openai = new OpenAI({ dangerouslyAllowBrowser: true });
```

Write the code the way an agent would, with the surrounding files that make it realistic. For a clean case, add the traps a reviewed version still has (a `TODO` with a ticket, `rejectUnauthorized: true`, a codecov step with `continue-on-error`). `{{key:<length>:<seed>}}` becomes a random-looking key at runtime, so no key-like string is committed. A new pattern in `data/insecure-code.yml` or `data/code-quality.yml` gets a case that finds it and, where it could misfire, a clean case that must not. A new code rule goes into `SCORED`. Never lower the thresholds to make a change pass.

## Keep the documentation true

A change that affects what a rule does updates its documentation in the same commit. `npm run drift` and the tests catch most of it.

| You changed | Also change |
|---|---|
| Detection in `checks/<module>/<name>/check.ts` | `how` in that `rule.yml` (one sentence, names the data files it loads) |
| Messages of a rule in `lang/*.yml` | that `rule.yml` |
| Legal basis, wording or threshold | `legal_basis`, `fix_hint`, `meta.sources`, and `meta.last_reviewed` set to today |
| A rule added, removed or renamed | `rule.yml` with a new unique id, then `npm run docs` |
| A file in `data/` in a way that changes results | name the file in the commit message |
| An input of the action | `action.yml`, `src/options.ts`, `examples/workflows/rechtzeitig.yml` (set in `with:`, or commented with its default and named in `FILE_ONLY` in `src/inputs.test.ts`), `.github/workflows/rechtzeitig.yml` if this repository needs it, `docs/workflow.html` |
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

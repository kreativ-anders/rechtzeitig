# Architecture

```mermaid
flowchart LR
  W[workflow_dispatch<br/>url, language, ...] --> M[src/main.ts]
  M --> S[src/scan.ts<br/>website]
  M --> RS[src/repo/scan.ts<br/>repository]
  S --> C[ScanContext]
  RS --> RC[RepoContext]
  C --> R[src/runner.ts<br/>every checks/**/check.ts]
  RC --> R
  R --> O[src/report.ts<br/>summary, JSON, SBOM, exit code]
```

## Website

1. `src/crawl.ts` visits the start page, every link a language file names as a legal page, then a sample of the site's own pages, up to `max-pages`.
2. `src/capture.ts` loads each page twice in Chromium, JavaScript off and on. It records status, headers and their `<meta>` equivalents, text, links and buttons (also in shadow roots), forms, checkboxes, requests, cookies with flags, and localStorage. It never clicks.
3. `src/probe.ts` does the lookups that need no browser: paths from `data/probes.yml`, plain HTTP, the `www.` variant, TLS, SPF/DMARC, and IP countries when an IPinfo token is set.
4. `src/context.ts` wraps everything in a read-only `ScanContext` with helpers.

Both loads happen without interaction, so every request and cookie in the context happened before consent. Comparing the two loads shows what needs JavaScript.

## Repository

`src/repo/scan.ts` lists tracked files, parses lockfiles with `src/repo/lockfiles.ts`, reads the project license, and asks [OSV](https://osv.dev) for known vulnerabilities (`src/repo/osv.ts`). `src/repo/sbom.ts` turns the result into CycloneDX 1.6.

## Rules and checks

Each check folder has `rule.yml` (metadata: id, severity, tier, titles, legal basis, fix hint, review date, sources; schema in `src/rules.ts`) and `check.ts` (detection). Legal and wording updates are data changes in `rule.yml` and `lang/*.yml`, not engine changes.

`src/runner.ts` loads every `checks/**/check.ts` with its `rule.yml`. Website checks get the `ScanContext`, repository checks (`checks/repo/`) get the `RepoContext`. Each runs on its own with a timeout; a broken check becomes `error` and the rest still run. `src/main.ts` sets the exit code from `fail-on`.

## Findings

`toFindings` in `src/report.ts` builds `rechtzeitig-report.json`: rule id, severity, status, message and locations, never page text or file contents. Findings stay in the workflow artifact; nothing is sent anywhere.

`tier: pro` rules never live in this repository. If they come, they arrive as data at run time and use the same open engine, so the engine itself has no paid code paths.

## Layout

| Path | Content |
|---|---|
| `src/sdk.ts` | The only API for checks: types, result helpers, both contexts |
| `src/`, `src/repo/` | Crawler, probes, repository scan, runner, report and findings format, CLI |
| `checks/<module>/<name>/` | One check: `rule.yml`, `check.ts`, `test.ts`, `fixtures/` |
| `src/rules.ts`, `src/docs.ts` | Rule schema and validator; generator for `docs/checks.html` |
| `lang/*.yml` | Words per language, as regular expressions |
| `data/third-parties.yml` | Known services: hosts, country, consent, cookies |
| `data/probes.yml` | Paths to request without a browser |
| `data/secrets.yml` | Secret patterns |
| `test/helpers.ts` | Serves a fixture on localhost, builds repositories and contexts for tests |
| `docs/` | User documentation: plain HTML and one `style.css`, published with GitHub Pages, no build. `npm run docs` writes the rule cards in `checks.html`. Header and footer are copied into every page, so change them in all of them. `privacy.html` must stay true when the site starts loading anything new |
| `action.yml` | Composite action: Node 24, Playwright, scan, upload report |

## Choices

- TypeScript without a build step. Node 24 runs `.ts` files directly; `tsc` only type-checks.
- Two runtime dependencies: `playwright` and `yaml`.
- Tests use `node:test` and real Chromium against local fixtures. Requests to other hosts are recorded, then blocked; DNS, TLS and OSV are skipped. Tests run offline.
- The runner location is part of the result. GitHub-hosted runners are in the US; the report says so.

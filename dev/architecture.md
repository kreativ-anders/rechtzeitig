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
2. `src/capture.ts` loads each page twice in Chromium, JavaScript off and on. It records status, headers, text, links and buttons (also in shadow roots), forms, checkboxes, requests, cookies with flags, and localStorage. It never clicks.
3. `src/probe.ts` does the lookups that need no browser: paths from `data/probes.yml`, plain HTTP, the `www.` variant, TLS, SPF/DMARC, and IP countries when an IPinfo token is set.
4. `src/context.ts` wraps everything in a read-only `ScanContext` with helpers.

Both loads happen without interaction, so every request and cookie in the context happened before consent. Comparing the two loads shows what needs JavaScript.

## Repository

`src/repo/scan.ts` lists tracked files, parses lockfiles with `src/repo/lockfiles.ts`, reads the project license, and asks [OSV](https://osv.dev) for known vulnerabilities (`src/repo/osv.ts`). `src/repo/sbom.ts` turns the result into CycloneDX 1.6.

## Checks

`src/runner.ts` loads every `checks/**/check.ts`. Website checks get the `ScanContext`, repository checks (`checks/repo/`) get the `RepoContext`. Each runs on its own with a timeout; a broken check becomes `error` and the rest still run. `src/main.ts` sets the exit code from `fail-on`.

## Layout

| Path | Content |
|---|---|
| `src/sdk.ts` | The only API for checks: types, result helpers, both contexts |
| `src/`, `src/repo/` | Crawler, probes, repository scan, runner, report, CLI |
| `checks/<category>/<name>/` | One check: `check.ts`, `test.ts`, `fixtures/` |
| `lang/*.yml` | Words per language, as regular expressions |
| `data/third-parties.yml` | Known services: hosts, country, consent, cookies |
| `data/probes.yml` | Paths to request without a browser |
| `data/secrets.yml` | Secret patterns |
| `test/helpers.ts` | Serves a fixture on localhost, builds repositories and contexts for tests |
| `docs/` | User documentation, published with GitHub Pages |
| `action.yml` | Composite action: Node 24, Playwright, scan, upload report |

## Choices

- TypeScript without a build step. Node 24 runs `.ts` files directly; `tsc` only type-checks.
- Two runtime dependencies: `playwright` and `yaml`.
- Tests use `node:test` and real Chromium against local fixtures. Requests to other hosts are recorded, then blocked; DNS, TLS and OSV are skipped. Tests run offline.
- The runner location is part of the result. GitHub-hosted runners are in the US; the report says so.

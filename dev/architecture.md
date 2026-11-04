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
2. `src/capture.ts` loads each page twice in Chromium, JavaScript off and on. It records status, headers and their `<meta>` equivalents, text, links and buttons (also in shadow roots), forms, checkboxes, requests with status, Content-Type and cache headers (browser cache off), cookies with flags, and localStorage. It never clicks. Chromium runs with its sandbox; where the runner has none, the scan stops unless `require-sandbox: false`, and the report warns. It gets only `PATH`, `HOME` and locale variables, no tokens, and blocks downloads and service workers. Each load has an overall deadline, so a page that never yields becomes an error. Text (200 KB), links (2000), link labels (300 characters) and requests (5000) are capped.
3. `src/probe.ts` does the lookups that need no browser: paths from `data/probes.yml`, plain HTTP, the `www.` variant, TLS, SPF/DMARC, IP countries when an IPinfo token is set, and green hosting of the start page's host at the Green Web Foundation unless `green-hosting: false`.
   They run against the start page's final URL only if it is on the same site as the input URL, otherwise against the input URL.
4. `src/net.ts` keeps the scan off private networks. `publicAddresses()` resolves a host once and allows it only if every address is public; the connection then uses exactly these addresses (`pinned()`), so a DNS answer that changes in between (rebinding) cannot reach the runner's network. Requests without a browser use it directly, with redirects followed by hand and checked per hop. The browser connects only through `publicProxy()`, a local SOCKS5 proxy that does the same for every page, redirect, subresource and WebSocket. The host of the input URL is always allowed, so local dev servers and test fixtures work.
5. `src/context.ts` wraps everything in a read-only `ScanContext` with helpers.

Both loads happen without interaction, so every request and cookie in the context happened before consent. Comparing the two loads shows what needs JavaScript.

## Repository

`src/repo/scan.ts` lists tracked files, parses lockfiles with `src/repo/lockfiles.ts`, reads the project license, and asks [OSV](https://osv.dev) for known vulnerabilities (`src/repo/osv.ts`) unless the input `vulnerabilities` is `false`. Every OSV hit is kept; details (summary, severity, fixed version) are loaded for up to 100 of them, and the status says when some are missing. `src/repo/sbom.ts` turns the result into CycloneDX 1.6.

The repository is untrusted. Only regular files count: symlinks and devices are skipped, files are read up to 1 MB without following links, and git runs without fsmonitor and system config.

## Rules and checks

Each check folder has `rule.yml` (metadata: id, severity, titles, legal basis, fix hint, review date, sources; schema in `src/rules.ts`) and `check.ts` (detection). Legal and wording updates are data changes in `rule.yml` and `lang/*.yml`, not engine changes.

`src/runner.ts` loads every `checks/**/check.ts` with its `rule.yml`. Website checks get the `ScanContext`, repository checks (`checks/repo/`) get the `RepoContext`. Each runs on its own with a timeout; a broken check becomes `error` and the rest still run. A rule that lists an input in `requires` (`SWITCHES` in `src/rules.ts`: a secret such as `IPINFO_TOKEN`, an opt-in like `subscriptions: true`, or an opt-out like `vulnerabilities: false`) is skipped unless `src/main.ts` finds that input on; the skip message is `messages.common.switch_<input>`. `npm run docs` turns the same list into the "What runs when" tables, so every API with a token is opt-in and every switch is documented. `src/main.ts` sets the exit code from `fail-on`.

## Findings

Messages and details carry text from the scanned site and repository. Every output passes them through `oneLine()` in `src/text.ts` (no control characters, at most 300 characters). The step summary escapes Markdown and HTML; the log is wrapped in `::stop-commands::` with a random token, so no line becomes a workflow command.

Checks return message keys with parameters, not sentences. `src/messages.ts` renders them in the report language from `lang/<code>.yml` `messages`, with plural forms from `Intl.PluralRules`. Findings with a file and line also become GitHub annotations (`toAnnotations` in `src/report.ts`); they are printed after the stop-commands block, so every value is escaped the way the Actions toolkit does it. GitHub shows at most 10 annotations per level and step; the step summary always has all findings, the artifact also every passed and skipped check.

`toFindings` in `src/report.ts` builds `rechtzeitig-report.json`: rule id, severity, status, message in the report language with its key and parameters, and locations, never page text or file contents. Findings stay in the workflow artifact; nothing is sent anywhere.

## Layout

| Path | Content |
|---|---|
| `src/sdk.ts` | The only API for checks: types, result helpers, both contexts |
| `src/`, `src/repo/` | Crawler, probes, repository scan, runner, report and findings format, CLI |
| `src/net.ts`, `src/text.ts` | Public-address checks for every request; `oneLine()` for untrusted text in outputs |
| `checks/<module>/<name>/` | One check: `rule.yml`, `check.ts`, `test.ts`, `fixtures/` |
| `src/rules.ts`, `src/docs.ts` | Rule schema and validator; generator for `docs/checks.html` |
| `lang/*.yml` | Words per language, as regular expressions |
| `data/third-parties.yml` | Known services: hosts, country, consent, cookies |
| `data/probes.yml` | Paths to request without a browser |
| `data/secrets.yml` | Secret patterns |
| `data/licenses.yml` | License groups: AGPL, GPL, restricted, permissive |
| `data/update-tools.yml` | Dependabot ecosystem names, Renovate config paths, vulnerability scanners |
| `data/countries.yml`, `data/cookies.yml`, `data/leaks.yml`, `data/outdated-links.yml`, `data/hsts-preload.yml` | Lists for single checks: EEA countries, session cookie names, error traces, closed services, HSTS-preloaded top-level domains |
| `test/helpers.ts` | Serves a fixture on localhost, builds repositories and contexts for tests |
| `docs/` | User documentation: plain HTML and one `style.css`, published with GitHub Pages, no build. `npm run docs` writes the rule cards in `checks.html`. Header and footer are copied into every page, so change them in all of them. `privacy.html` must stay true when the site starts loading anything new. `imprint.html` holds the provider details under § 5 DDG; update it when they change |
| `action.yml` | Composite action: Node 24, Playwright, AppArmor profile for the Chrome sandbox on GitHub-hosted Ubuntu, scan, upload report |
| `.github/workflows/release.yml` | Release by hand (Actions → release → Run workflow, patch, minor or major): runs `test.yml`, bumps the latest tag, sets `package.json`, tags, publishes the release (a pre-release before v1.0.0) and pins `examples/workflows/rechtzeitig.yml` to its SHA |

## Choices

- TypeScript without a build step. Node 24 runs `.ts` files directly; `tsc` only type-checks.
- Two runtime dependencies: `playwright` and `yaml`.
- Tests use `node:test` and real Chromium against local fixtures. Requests to other hosts are recorded, then aborted by a route (`offline`); DNS, TLS and OSV are skipped. Tests run offline.
- The runner location is part of the result. GitHub-hosted runners are in the US; the report says so.

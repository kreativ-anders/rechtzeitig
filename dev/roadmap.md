# Roadmap

rechtzeitig is a CI tool for technical decision makers. The repository scan is the core; the website scan is an add-on that reads the start page and the legal pages, not the whole site. German comes first, but every word of a report comes from `lang/*.yml`, so a new language is one new file.

Items are listed in order of priority.

## Released: v0.1.0 (2026-11-04)

The first pre-release, not yet alpha or beta. An immutable GitHub pre-release; `examples/workflows/rechtzeitig.yml` is pinned to its commit SHA. No moving major tag before `v1.0.0`.

It contains the security fixes, CI hardening, detection fixes and lean-code refactors from the audit of 2026-11-03; `tier` removed; legal references reviewed on 2026-11-04 (CRA articles and dates, BFSG via EN 301 549 V3.2.1, § 36 VSBG, rulings as sources); primary sources only (`data/source-domains.yml`) and the `review-sources` skill. Repository settings: read-only workflow token, GitHub-owned actions only, SHA pinning required, immutable releases, head branches deleted after merge, Dependabot alerts.

## Before the repository goes public


- Turn on private vulnerability reporting (only possible for public repositories), which `SECURITY.md` points to. Confirm the answer time stated there.
- A ruleset for `main`: pull requests only, status check `test` required, no force push, signed commits.
- A ruleset for `v*` tags: no update, no delete.
- Code scanning: CodeQL runs once the repository is public (`.github/workflows/codeql.yml` skips while it is private); add the OpenSSF Scorecard action.
- `CODEOWNERS`.
- Run `rechtzeitig.yml` on this repository and its site once. Confirm that Chrome starts with its sandbox on `ubuntu-latest`: Ubuntu 24.04 restricts the user namespaces it needs, and without them the scan stops unless `require-sandbox: false`. If it stops, decide how the action enables the sandbox on GitHub-hosted runners.

## Next: hardening

Open points from the audit of 2026-11-03, after the fixes.

1. SARIF output for code scanning. Untrusted text is already sanitized in `toFindings`, so a writer can build on it.
2. `step-security/harden-runner` with an egress allowlist in `test.yml`.
3. Dependabot for `examples/workflows/`, if the `github-actions` ecosystem reads workflow files outside `.github/`; until then `src/pinning.test.ts` catches drift.
4. Timing tests (`capture.test.ts`, the backtracking tests) fail when the machine sleeps during the run. Run local test runs with `caffeinate` on macOS, or measure CPU time.

## Next: repository

Done since v0.1.0: PR annotations for findings with file and line; reports fully in the chosen language (checks return message keys, the sentences and vendor advice are in `lang/*.yml` and `data/third-parties.yml` per language).

1. Workflows with `pull_request_target` and a checkout of the PR head, `${{ github.event.* }}` in `run:`, missing or `write-all` permissions, `curl | sh`.
2. Secrets in the git history. By default only the commits a pull request or push adds, so old, revoked keys do not flood every run; an input `history: full` scans the whole history once, for an audit (needs `fetch-depth: 0`).
3. Third-party services in the code: hosts and SDK packages from `data/third-parties.yml`, e.g. Google Fonts URLs (§ 25 TDDDG, Art. 13 DSGVO).
4. Secret-looking names behind public env prefixes (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`) that end up in the client bundle.
5. Package names that do not exist or look like typos of popular ones.
6. A vulnerability contact: `SECURITY.md` or `.well-known/security.txt` (CRA Annex I Part II).
7. License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).
8. SBOM fields as BSI TR-03183-2 asks (CRA Annex I Part II).
9. `cors` with `origin: *` and credentials, admin routes without an auth check.
10. License headers of other projects inside your own files.

## Next: repository and website together

Findings that only a scan of both can give. Today a check gets either the website or the repository, never both.

1. Checks that read the website and the repository together. `data/third-parties.yml` gets package names and code snippets per service.
2. Vendors in the code compared with the privacy policy and with what the site loads (Art. 13 DSGVO).
3. Font packages such as `@fontsource/*` installed, but the site still loads Google Fonts (LG München I, 3 O 17493/20).
4. Security headers and CSP defined in the repository compared with the headers the site sends.
5. Imprint and privacy texts in the repository compared with the rendered pages.

## Next: website

Start page and legal pages only. No full-site crawl.

1. After a click on "reject": check that no tracker loads. The only check that would need a click.
2. Outdated references in imprint and privacy policy: TMG, TTDSG, Privacy Shield (DDG, TDDDG, EuGH C-311/18).
3. `security.txt` (RFC 9116), as a probe.
4. Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
5. Imprint of a GmbH, UG or AG names a representative (§ 5 Abs. 1 Nr. 1 DDG).
6. Statement on consumer dispute resolution with `sales: true`, as a hint, since the 10-employee threshold is unknown (§ 36 VSBG).
7. A few unambiguous accessibility checks and the accessibility information for shops (BFSG, § 14 and Anlage 3), not a full axe-core run.
8. Total prices including VAT where prices appear (PAngV).
9. Withdrawal notice says where the withdrawal function is, with `sales: true` (Art. 246a § 1 Abs. 2 EGBGB).
10. A link to change consent on the start page once a banner was found (Art. 7 Abs. 3 DSGVO).
11. Forms that send to another site: receiver named in the privacy policy, its country checked (Art. 13 Abs. 1 lit. e, Art. 44 DSGVO).
12. Environmental claims such as "klimaneutral" on the start page, as a warning (UWG, Directive (EU) 2024/825, from 27 September 2026).

## Next: sustainability

A few checks taken from the Sustainable Web Analyzer. Page weight, compression and CO2 stay there. No legal basis; W3C Web Sustainability Guidelines as sources only.

1. Record content type and cache headers of every request, with the browser cache off.
2. Images in JPEG, PNG or GIF instead of WebP or AVIF, fonts in TTF or OTF instead of WOFF2.
3. Own static files served without cache headers.
4. Green hosting of the site, checked with the Green Web Foundation, on by default with an input to turn it off. This sends the host name to them, so `docs/privacy.html` names it.

## Later

- More report languages.
- Prebuilt container image to skip the browser download.
- `v1.0.0` with a moving `v1` tag, once the checks are stable.
- Consent checks after the Digital Omnibus, if cookie rules move into the GDPR (proposed Art. 88a, 88b DSGVO).

## Commercialization

None for now. rechtzeitig stays a pure CI tool: no paid features, no paid code paths, no hooks for them in the engine. The repository stays private. Review this section before it goes public.

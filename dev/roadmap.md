# Roadmap

rechtzeitig is a CI tool for technical decision makers. The repository scan is the core; the website scan is an add-on that reads the start page and the legal pages, not the whole site. German comes first, but every word of a report comes from `lang/*.yml`, so a new language is one new file.

Items are listed in order of priority.

## Next: hardening

Open points from the audit of 2026-11-03, after the fixes.

1. SARIF output for code scanning. Untrusted text is already sanitized in `toFindings`, so a writer can build on it.
2. `step-security/harden-runner` with an egress allowlist in `test.yml`.
3. Dependabot for `examples/workflows/`, if the `github-actions` ecosystem reads workflow files outside `.github/`; until then `src/pinning.test.ts` catches drift.
4. Require pull requests, the `test` check and signed commits on `main`. Needs a release workflow that does not push to `main` with `GITHUB_TOKEN`, which cannot bypass a ruleset; today the ruleset only blocks deletion and force pushes.
5. Timing tests (`capture.test.ts`, the backtracking tests) measure CPU time instead of wall time, so they no longer fail when the machine sleeps during the run.

## Next: repository

1. Secrets in the git history. By default only the commits a pull request or push adds, so old, revoked keys do not flood every run; an input `history: full` scans the whole history once, for an audit (needs `fetch-depth: 0`).
2. Third-party services in the code: hosts and SDK packages from `data/third-parties.yml`, e.g. Google Fonts URLs (§ 25 TDDDG, Art. 13 DSGVO).
3. Secret-looking names behind public env prefixes (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`) that end up in the client bundle.
4. Package names that do not exist or look like typos of popular ones.
5. License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).
6. SBOM fields as BSI TR-03183-2 asks (CRA Annex I Part II).
7. `cors` with `origin: *` and credentials, admin routes without an auth check.
8. License headers of other projects inside your own files.
9. Google Tag Manager container exports in the repo: tags, triggers, Consent Mode wiring.
10. Repository health beyond the audit list: LICENSE file present, recent maintenance, CI tests configured.

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
2. Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
3. Imprint of a GmbH, UG or AG names a representative (§ 5 Abs. 1 Nr. 1 DDG).
4. Statement on consumer dispute resolution with `sales: true`, as a hint, since the 10-employee threshold is unknown (§ 36 VSBG).
5. A few unambiguous accessibility checks and the accessibility information for shops (BFSG, § 14 and Anlage 3), not a full axe-core run.
6. Total prices including VAT where prices appear (PAngV).
7. Withdrawal notice says where the withdrawal function is, with `sales: true` (Art. 246a § 1 Abs. 2 EGBGB).
8. A link to change consent on the start page once a banner was found (Art. 7 Abs. 3 DSGVO).
9. Forms that send to another site: receiver named in the privacy policy, its country checked (Art. 13 Abs. 1 lit. e, Art. 44 DSGVO).
10. Environmental claims such as "klimaneutral" on the start page, as a warning (UWG, Directive (EU) 2024/825, from 27 September 2026).
11. AI transparency per Art. 50 AI Act (from 02.08.2026): a chatbot labeled as AI before the first input, deepfakes visibly disclosed, AI services named in the privacy policy.
12. A named natural person as editorially responsible when the site has journalistic content, blog, news or podcast (§ 18 Abs. 2 MStV).
13. Newsletter signup: double opt-in wording and an unsubscribe link next to the form (UWG § 7).
14. With `sales: true`: T&Cs linked and reachable, and the full withdrawal instruction with the model form (Art. 246a § 1 EGBGB), not only the pointer to the withdrawal function (item 9).
15. With `sales: true`, PAngV beyond item 8: base price (Grundpreis), shipping cost notice, and the 30-day rule for strikethrough prices.
16. With `sales: true`: product pages name manufacturer, importer or responsible person and safety information (Reg. (EU) 2023/988, since 13.12.2024); packaging registration number (VerpackG § 9, LUCID) in the imprint; PPWR packaging labeling from 12.08.2026.
17. With `sales: true`: legal guarantee and commercial guarantee labels per Directive (EU) 2024/825 from 27.09.2026, besides the environmental claims in item 12.
18. Dark patterns in the consent banner: reject as prominent as accept (size, contrast), no confirmation shaming (UWG § 3, Art. 7 Abs. 3 DSGVO).
19. Global Privacy Control (GPC) signal honored by the consent tool, as a warning.
20. Lifetimes of non-essential cookies beyond the ~13-month guideline, as a warning.
21. The served HTML and client JS of normal pages: suspicious comments, personal data, exposed API keys.
22. Client-side JS libraries in the served bundle with known CVEs; the repo vulnerability check covers dependencies, not the bundle.
23. Detected CMS or framework version (generator meta, headers, paths) compared with known CVEs.
24. Subresource integrity attributes on third-party scripts.
25. DNSSEC and CAA records of the domain and the depth of SPF includes; `email-dns` today covers only SPF, DMARC and MX.
26. Permissive `crossdomain.xml` / `clientaccesspolicy.xml` and directory listings beyond the probe list.
27. Subdomain takeover: dangling DNS records of own subdomains via certificate transparency logs and a fingerprint list. Sends subdomain names to external log services, so off by default with an input.
28. Open ports and exposed services on the scanned host only, a port scan from the runner.

## Next: sustainability

A few sustainability checks. Page weight, compression and CO2 are out of scope. No legal basis; W3C Web Sustainability Guidelines as sources only.

1. Record content type and cache headers of every request, with the browser cache off.
2. Images in JPEG, PNG or GIF instead of WebP or AVIF, fonts in TTF or OTF instead of WOFF2.
3. Own static files served without cache headers.
4. Green hosting of the site, checked with the Green Web Foundation, on by default with an input to turn it off. This sends the host name to them, so `docs/privacy.html` names it.

## Later

- More report languages.
- Prebuilt container image to skip the browser download.
- `v1.0.0` with a moving `v1` tag, once the checks are stable.
- Consent checks after the Digital Omnibus, if cookie rules move into the GDPR (proposed Art. 88a, 88b DSGVO).
- DACH variants of the legal pages: Switzerland (revDSG Art. 19, Art. 3 UWG) and Austria (§ 5 ECG, § 25 MedienG "Blattlinie"), once more report languages land.

## Commercialization

None for now. rechtzeitig stays a pure CI tool: no paid features, no paid code paths, no hooks for them in the engine.

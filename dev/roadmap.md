# Roadmap

rechtzeitig is a CI tool for technical decision makers. The repository scan is the core; the website scan is an add-on that reads the start page and the legal pages, not the whole site. German comes first, but every word of a report comes from `lang/*.yml`, so a new language is one new file.

Items are listed in order of priority.

## Next: hardening

Open points from the audit of 2026-11-03, after the fixes.

1. `step-security/harden-runner` with an egress allowlist in `test.yml`.
2. Dependabot for `examples/workflows/`, if the `github-actions` ecosystem reads workflow files outside `.github/`; until then `src/pinning.test.ts` catches drift.
3. Require pull requests, the `test` check and signed commits on `main`. Needs a release workflow that does not push to `main` with `GITHUB_TOKEN`, which cannot bypass a ruleset; today the ruleset only blocks deletion and force pushes.
4. Timing tests (`capture.test.ts`, the backtracking tests) measure CPU time instead of wall time, so they no longer fail when the machine sleeps during the run.

## Next: repository

1. Secrets in the git history. By default only the commits a pull request or push adds, so old, revoked keys do not flood every run; an input `history: full` scans the whole history once, for an audit (needs `fetch-depth: 0`).
2. Third-party services in the code: hosts and SDK packages from `data/third-parties.yml`, e.g. Google Fonts URLs (§ 25 TDDDG, Art. 13 DSGVO).
3. Package names that do not exist or look like typos of popular ones.
4. License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).
5. SBOM fields as BSI TR-03183-2 asks (CRA Annex I Part II).
6. `cors` with `origin: *` and credentials, admin routes without an auth check.
7. License headers of other projects inside your own files.
8. Google Tag Manager container exports in the repo: tags, triggers, Consent Mode wiring.
9. Repository health beyond the audit list: LICENSE file present, recent maintenance, CI tests configured.
10. CRA for repositories that are products (library, CLI, firmware): support period or supported versions in `SECURITY.md` (Art. 13 Abs. 8, Annex II CRA), a coordinated disclosure policy, signed releases with provenance. Reporting duties apply since 11.09.2026.
11. Dockerfile and infrastructure code: containers running as root, base images on `latest`, security groups open to the internet.
12. AI model files and references (weights, Hugging Face model IDs) with their licenses (Llama, OpenRAIL) in the license check.

## Next: repository and website together

Findings that only a scan of both can give. Today a check gets either the website or the repository, never both.

1. Checks that read the website and the repository together. `data/third-parties.yml` gets package names and code snippets per service.
2. Vendors in the code compared with the privacy policy and with what the site loads (Art. 13 DSGVO).
3. Font packages such as `@fontsource/*` installed, but the site still loads Google Fonts (LG München I, 3 O 17493/20).
4. Security headers and CSP defined in the repository compared with the headers the site sends.
5. Imprint and privacy texts in the repository compared with the rendered pages.
6. AI SDKs in the code compared with the privacy policy and the AI labeling on the site (Art. 13 DSGVO, Art. 50 AI Act).

## Next: website

Start page and legal pages only. No full-site crawl.

1. After a click on "reject": check that no tracker loads. The only check that would need a click.
2. Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
3. Imprint of a GmbH, UG or AG names a representative (§ 5 Abs. 1 Nr. 1 DDG).
4. Statement on consumer dispute resolution with `sales: true`, as a hint, since the 10-employee threshold is unknown (§ 36 VSBG).
5. A few unambiguous accessibility checks (selected axe-core rules: alt text, form labels, contrast) and the accessibility information for shops (BFSG, § 14 and Anlage 3) or the accessibility statement with feedback contact for public bodies (BITV 2.0 § 7), not a full axe-core run.
6. Total prices including VAT where prices appear (PAngV).
7. Withdrawal notice says where the withdrawal function is, with `sales: true` (Art. 246a § 1 Abs. 2 EGBGB).
8. Forms that send to another site: receiver named in the privacy policy, its country checked (Art. 13 Abs. 1 lit. e, Art. 44 DSGVO).
9. Environmental claims such as "klimaneutral" on the start page, as a warning (UWG, Directive (EU) 2024/825, from 27 September 2026).
10. AI transparency per Art. 50 AI Act (from 02.08.2026): a chatbot labeled as AI before the first input, deepfakes visibly disclosed, AI services named in the privacy policy.
11. A named natural person as editorially responsible when the site has journalistic content, blog, news or podcast (§ 18 Abs. 2 MStV).
12. Newsletter signup: double opt-in wording and an unsubscribe link next to the form (UWG § 7).
13. With `sales: true`: T&Cs linked and reachable, and the full withdrawal instruction with the model form (Art. 246a § 1 EGBGB), not only the pointer to the withdrawal function (item 9).
14. With `sales: true`, PAngV beyond item 8: base price (Grundpreis), shipping cost notice, and the 30-day rule for strikethrough prices.
15. With `sales: true`: product pages name manufacturer, importer or responsible person and safety information (Reg. (EU) 2023/988, since 13.12.2024); packaging registration number (VerpackG § 9, LUCID) in the imprint; PPWR packaging labeling from 12.08.2026.
16. With `sales: true`: legal guarantee and commercial guarantee labels per Directive (EU) 2024/825 from 27.09.2026, besides the environmental claims above.
17. Global Privacy Control (GPC) signal honored by the consent tool, as a warning.
18. The served HTML and client JS of normal pages: suspicious comments, personal data, exposed API keys.
19. Client-side JS libraries in the served bundle with known CVEs; the repo vulnerability check covers dependencies, not the bundle.
20. Detected CMS or framework version (generator meta, headers, paths) compared with known CVEs.
21. DNSSEC and CAA records of the domain, the depth of SPF includes, MTA-STS and TLS-RPT; `email-dns` today covers only SPF, DMARC and MX.
22. Permissive `crossdomain.xml` / `clientaccesspolicy.xml` and directory listings beyond the probe list.
23. Subdomain takeover: dangling DNS records of own subdomains via certificate transparency logs and a fingerprint list. Sends subdomain names to external log services, so off by default with an input.
24. Open ports and exposed services on the scanned host only, a port scan from the runner.
25. Customer reviews or trust badges on the page without a statement whether and how their authenticity is checked (§ 5b Abs. 3 UWG).
26. Sites with user content (comments, uploads, marketplace): DSA contact points (Art. 11, 12), a notice-and-action route (Art. 16) and the content rules in the terms (Art. 14); ad labeling on platforms (Art. 26). As a warning, since the scan cannot tell whether the site is a hosting service.
27. Machine-readable reservation against text and data mining (robots.txt rules for AI crawlers, TDMRep header or `/.well-known/tdmrep.json`), as info only, since it is the owner's choice (§ 44b Abs. 3 UrhG, Art. 53 Abs. 1 lit. c AI Act).
28. With `sales: true`: WEEE registration number and take-back notices for electrical devices and batteries (§ 18 ElektroG, BattDG), textile fiber labeling (Reg. (EU) 1007/2011).
29. The contact page as one more visited page, since most forms with personal data live there.
30. Screenshots of findings and a HAR file of the run as workflow artifacts, as evidence for the report.

## Later

- More report languages.
- Prebuilt container image to skip the browser download.
- `v1.0.0` with a moving `v1` tag, once the checks are stable.
- Consent checks after the Digital Omnibus, if cookie rules move into the GDPR (proposed Art. 88a, 88b DSGVO).
- Not planned, since a scan cannot see them: organizational duties of NIS2, the Data Act (connected products), the Hinweisgeberschutzgesetz, trademark law.
- DACH variants of the legal pages: Switzerland (revDSG Art. 19, Art. 3 UWG) and Austria (§ 5 ECG, § 25 MedienG "Blattlinie"), once more report languages land.

## Commercialization

The line: what runs in the user's runner and concerns one run is free. What needs our infrastructure and remembers across runs can be paid.

Free, in this repository:

- Every check, the SBOM, the report as Markdown and JSON, `fail-on`, annotations, step summary.
- Keeping findings private (`report-visibility`). Nobody pays for their weaknesses not being published.
- A stable, versioned report JSON. It is the interface to the hosted service.
- Findings as SARIF in GitHub's Security tab (`sarif-upload`). For a single public repository this already gives new, fixed and dismissed findings, so the paid service does not compete with it.

Paid, a hosted service in its own repository, for what the Security tab does not cover: private repositories without GitHub Code Security, many sites at once, sites without GitHub, and readers without a GitHub account.

- Dashboard with the history of runs: trends, what is new, what was fixed.
- One view over many sites and repositories, for agencies with client projects.
- Notifications (mail, Slack, Teams) on new findings only, which needs stored state.
- Accepting a finding with a reason, and a record of who did it and when.
- Reports for clients (PDF), team access and roles.
- Scheduled scans without an own workflow, also for sites without GitHub.

Rules:

- The engine has no paid code paths, hooks or feature flags. The action only writes the JSON.
- A separate upload step, in another repository, sends the JSON with a token. Without a token nothing is sent.
- The service receives sensitive findings: hosting in the EU and a data processing agreement are part of the offer.

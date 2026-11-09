# Roadmap

rechtzeitig is a CI tool for technical decision makers. The core is the repository and the live website together: findings that only a scan of both can give, such as a tracking id in the code that loads before consent or a hosting provider the privacy policy does not name. Each side also has its own checks. The website scan reads the start page, the legal pages and a small sample of other pages (`max-pages`), not the whole site. German comes first, but every word of a report comes from `lang/*.yml`, so a new language is one new file.

Items are listed in order of priority.

## Next: hardening

Open points from the audit of 2026-11-03, after the fixes.

1. `step-security/harden-runner` with an egress allowlist in `test.yml`. No workflow uses it yet.
2. Pins in `examples/workflows/` moved automatically. Dependabot's `github-actions` ecosystem reads only `.github/workflows/` and `action.yml`; the release workflow moves the rechtzeitig pin there, and `src/pinning.test.ts` fails when another pin drifts from `action.yml` and `.github/workflows/`.
3. Require signed commits on `main`. The ruleset on `main` already requires pull requests and the `test` and `drift` checks and blocks force pushes; the release workflow does not push to `main`. Its pull request commit is made by `github-actions[bot]` and is not signed.

## Next: repository

Ordered by value per effort. The first six need only a new `data/*.yml` and the existing `RepoContext`.

1. Committed key and data files that `env-files` misses: `*.pem`, `*.key`, `*.p12`, `id_rsa*`, `*.tfstate`, service-account JSON, `.npmrc` with a token, database dumps (Art. 5 Abs. 1 lit. f, Art. 32 DSGVO).
2. Unverifiable install sources: `http://` or missing `integrity` in lockfiles, git dependencies without a commit, `--extra-index-url`, `strict-ssl=false` (CRA Annex I Part I).
3. Third-party SDKs in the code as info with vendor and country, also without a website (Art. 28, 44 DSGVO). The `packages:` field in `data/third-parties.yml` exists; `privacy/sdks-in-privacy-policy` compares it with the privacy policy.
4. Dockerfile and Compose: no `USER` or `USER root`, `:latest` base images, secrets in `ENV`/`ARG`, `privileged: true`, the Docker socket mounted, database ports published.
5. CRA for repositories that are products (library, CLI, firmware): support period in `SECURITY.md` (Art. 13 Abs. 8 CRA) and releases with provenance or a signature. `security/security-contact` checks only that a reporting channel exists. Reporting duties apply since 11.09.2026.
6. More patterns in `workflow-risks`: secrets echoed into logs, `secrets: inherit` to external workflows, self-hosted runners on pull requests.
7. Runtimes past their end of life (`engines.node`, `.nvmrc`, `FROM php:7.4`, `requires-python`), dates in a data file.
8. In code: `cors` with `origin: *` and credentials, in JS and header config files. `security/cors` checks only the headers the site sends.
9. Secrets in the git history. By default only the commits a pull request or push adds; an input `history: full` scans the whole history once, for an audit (needs `fetch-depth: 0`).
10. Third-party hosts in templates and styles without a website scan, as a warning. With a URL, `privacy/google-fonts-source` covers Google Fonts.
11. SBOM fields as BSI TR-03183-2 asks: hashes, supplier, dependency graph (CRA Annex I Part II).
12. License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go, and yarn.lock). Needs a registry API, so a switch. `legal/unknown-licenses` names them as not checked today.
13. Registry lookup for `security/hallucinated-packages`: ask each registry's official API (npm registry, PyPI JSON API, crates.io, Packagist, pub.dev) whether a declared name exists and when it was first published, so a made-up or days-old name is a finding even when it is locked. Only package names leave the runner. On by default with an opt-out input (`registry-lookups: false`), listed in `SWITCHES` and in "Data that leaves the runner". The offline part (names missing from the lockfile, look-alikes of popular names) is done.
14. Infrastructure code: Terraform security groups open to `0.0.0.0/0`, public buckets, privileged Kubernetes pods.
15. More license rules: SPDX headers per file and vendored files under a foreign license (REUSE), NOTICE duties of Apache-2.0 dependencies, font files and their licenses. More entries in `data/relicensing.yml` where the change differs per release branch (Vault, Consul, Nomad, Packer), which needs version ranges.
16. A parser for `bun.lock` (JSON with comments). Without it, `hallucinated-packages` and `lockfile-drift` skip folders with a Bun lockfile, which projects from AI app builders often have next to `package-lock.json`.
17. MCP servers in Codex `config.toml` (`[mcp_servers.*]`) for `agent-permissions`; today only its approval and sandbox settings are read.
18. More code patterns on `data/insecure-code.yml`, each with a benchmark case: auth bypass flags (`SKIP_AUTH`, `NODE_ENV` checks in auth middleware), unsafe HTML (`dangerouslySetInnerHTML`, `v-html` with variables), personal data in logs (`console.log(req.body)`), SQL built from strings.
19. Visible suppressions: a committed file lists rule id, path, a mandatory reason and an expiry date; suppressed findings stay in the report and in SARIF as "suppressed" with the reason, and a suppression without a reason or past its date counts as a finding. Nothing can drop a finding silently.

## Next: repository and website together

Findings that only a scan of both can give (`defineCrossCheck`). Thirteen exist: database rules of the project the site uses, secrets in the served JavaScript, SDKs in the code against the privacy policy, Google Fonts with their source in the repository, source maps that expose repository files, security headers from hosting configs, the deployed `security.txt`, template data in the legal texts, the hosting provider in the privacy policy, tracking ids from the code before consent, a consent tool in the repository that is not active on the site, form receivers in the privacy policy, and dev servers or debug builds in production.

1. AI SDKs in the code compared with the AI labeling on the site (Art. 50 AI Act). Today `privacy/sdks-in-privacy-policy` only checks that the privacy policy names the AI provider; telling a chat feature from server-side use is not precise enough yet.
2. Imprint and privacy texts in the repository compared with the rendered pages, beyond the template data `legal/placeholder-legal-texts` finds.
3. Security headers from `next.config` `headers()`, nginx and helmet. `security/headers-deployed` reads `vercel.json`, `firebase.json`, `netlify.toml`, `_headers` and `.htaccess`.
4. SDK packages of other ecosystems (Composer, PyPI) in `data/third-parties.yml`; today only npm.
5. Third-party hosts in templates other than Google Fonts (maps, video embeds, CDNs), with the repository line, like `privacy/google-fonts-source`.
6. Client-side JS libraries in the served bundle compared with the lockfile, to tell an old deployed build from the repository.
7. Error monitoring and session replay configured in the code (Sentry `sendDefaultPii`, replay sample rates, LogRocket, FullStory) against consent and the privacy policy (Art. 5, 13, 25 DSGVO, § 25 TDDDG). Needs telling browser from server config apart.
8. An AGPL dependency (`legal/network-copyleft`) in an app the site serves, and no link to its source on the site (AGPL-3.0 § 13); a Llama model (`legal/ai-model-licenses`) and no "Built with Llama" on the site.

## Next: website

Start page, legal pages and a small sample of other pages. No full-site crawl.

1. After a click on "reject": check that no tracker loads. The only check that would need a click.
2. Imprint of a GmbH, UG or AG names a representative (§ 5 Abs. 1 Nr. 1 DDG).
3. Statement on consumer dispute resolution with `sales: true`, as a hint, since the 10-employee threshold is unknown (§ 36 VSBG).
4. The accessibility information for shops (BFSG, § 14 and Anlage 3) or the accessibility statement with feedback contact for public bodies (BITV 2.0 § 7). Selected axe-core rules run since the accessibility checks `alt-text`, `form-labels`, `control-names` and `contrast`; more rules only when they are as unambiguous.
5. Forms that send to another site the repository does not name (a CMS, a plugin): receiver named in the privacy policy, its country checked (Art. 13 Abs. 1 lit. e, Art. 44 DSGVO). `privacy/form-receiver` covers receivers the repository names.
6. Environmental claims such as "klimaneutral" on the start page, as a warning (UWG, Directive (EU) 2024/825, from 27 September 2026).
7. AI transparency per Art. 50 AI Act (from 02.08.2026): a chatbot labeled as AI before the first input, deepfakes visibly disclosed, AI services named in the privacy policy.
8. A named natural person as editorially responsible when the site has journalistic content, blog, news or podcast (§ 18 Abs. 2 MStV).
9. Newsletter signup: double opt-in wording and an unsubscribe link next to the form (UWG § 7).
10. With `sales: true`: product pages name manufacturer, importer or responsible person and safety information (Reg. (EU) 2023/988, since 13.12.2024); packaging registration number (VerpackG § 9, LUCID) in the imprint; PPWR packaging labeling from 12.08.2026.
11. With `sales: true`: legal guarantee and commercial guarantee labels per Directive (EU) 2024/825 from 27.09.2026, besides the environmental claims above.
12. Global Privacy Control (GPC) signal honored by the consent tool, as a warning.
13. The served HTML and client JS of normal pages: suspicious comments and personal data. Secrets are covered by `security/secrets-in-bundle`.
14. Client-side JS libraries in the served bundle with known CVEs; the repo vulnerability check covers dependencies, not the bundle.
15. Detected CMS or framework version (generator meta, headers, paths) compared with known CVEs. `security/error-disclosure` names version headers today, without a CVE lookup.
16. DNSSEC and CAA records of the domain, the depth of SPF includes, MTA-STS and TLS-RPT; `email-dns` today covers only SPF, DMARC and MX.
17. Permissive `crossdomain.xml` / `clientaccesspolicy.xml` and directory listings beyond the probe list.
18. Subdomain takeover: dangling DNS records of own subdomains via certificate transparency logs and a fingerprint list. Sends subdomain names to external log services, so off by default with an input.
19. Open ports and exposed services on the scanned host only, a port scan from the runner.
20. Customer reviews or trust badges on the page without a statement whether and how their authenticity is checked (§ 5b Abs. 3 UWG).
21. Sites with user content (comments, uploads, marketplace): DSA contact points (Art. 11, 12), a notice-and-action route (Art. 16) and the content rules in the terms (Art. 14); ad labeling on platforms (Art. 26). As a warning, since the scan cannot tell whether the site is a hosting service.
22. Machine-readable reservation against text and data mining (robots.txt rules for AI crawlers, TDMRep header or `/.well-known/tdmrep.json`), as info only, since it is the owner's choice (§ 44b Abs. 3 UrhG, Art. 53 Abs. 1 lit. c AI Act).
23. With `sales: true`: WEEE registration number and take-back notices for electrical devices and batteries (§ 18 ElektroG, BattDG), textile fiber labeling (Reg. (EU) 1007/2011).
24. The contact page always visited, like the legal pages, since most forms with personal data live there. Today only the sample of other pages may pick it.
25. Screenshots of findings and a HAR file of the run as workflow artifacts, as evidence for the report.
26. With `sales: true`: price reductions shown other than as a struck-through price, such as "-20 %" labels, checked for the 30-day lowest price (§ 11 PAngV).
27. Visit the T&Cs and withdrawal pages only with `sales: true`, so they do not use up `max-pages` on sites without a shop.

## Later

- Repository checks with a high false-positive risk or no legal basis: admin routes without an auth check, license headers of other projects, Google Tag Manager exports, repository health (LICENSE file, maintenance, CI).
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

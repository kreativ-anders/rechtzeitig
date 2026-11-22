# Roadmap

## Now

- [x] Report v2: machine-first JSON always written, English only, inputs `report-language` and `report-visibility` removed, `language: auto` (#113; concept: kreativ-anders/rechtzeitig-dashboard#72, #71). Wiki pages follow with the release.
- [ ] Workflow lockfiles: `actions.lock` here, SEC-DEPS-005 accepts locked refs (#108).
- [ ] Signed commits required on `main`, once a release pull request shows its commits as verified.
- [ ] Digital Fairness Act checks in their own group `dfa`, adjusted or dropped when the law changes (#79, #124).
- [ ] Wiki pages `Report` and `Inputs` match the release.

## Later

- `v1.0.0` with a moving `v1` tag, once the repositories are lean, precise and robust.
- The paid dashboard as a GitHub App on the Marketplace.
- A command line tool and container image for local runs.
- GitLab CI/CD on top of the CLI.

## Ideas

No order, no promise. Details go into an issue.

Repository:

- Third-party SDKs in the code as info, also without a website.
- Dockerfile, Compose, Kubernetes and Terraform risks.
- CRA for products: support period, signed releases with provenance.
- More `workflow-risks` patterns: secrets in logs, `secrets: inherit`, self-hosted runners.
- Runtimes past their end of life; debug settings in Spring, Django, ASP.NET; Flutter and Firebase config.
- Secrets in the git history; `cors` with `origin: *` in code.
- SBOM fields per BSI TR-03183-2.
- Lockfile parsers and license data for more ecosystems, `bun.lock` included.
- Opt-in registry lookup for `hallucinated-packages`.
- REUSE headers, NOTICE duties, font licenses, more relicensing entries.
- MCP servers in Codex `config.toml`.
- More insecure code patterns: auth bypass, unsafe HTML, personal data in logs, SQL from strings.
- Suppressions per file or page.

Repository and website together:

- AI SDKs against AI labeling; legal texts in the repository against the rendered pages.
- Headers from `next.config`, nginx, helmet; SDKs beyond npm; embeds in templates.
- Served JS libraries against the lockfile; error monitoring and session replay against consent.
- AGPL source link, "Built with Llama" notice.

Website:

- No tracker after a click on "reject".
- Imprint representative, consumer dispute statement, accessibility statement, editorial responsibility.
- Form receivers the repository does not name; newsletter double opt-in.
- Green and guarantee claims, AI transparency, review authenticity, DSA contacts, TDM reservation, GPC.
- Shop duties: product safety, packaging, electrical devices, textile labels, price reductions.
- Served code: comments, personal data, libraries and CMS versions with CVEs.
- DNSSEC, CAA, MTA-STS, `crossdomain.xml`, subdomain takeover (opt-in), port scan.
- Contact page always visited; screenshots and HAR as evidence.

Data sources (permissive licenses only): Open Cookie Database, retire.js, gitleaks, zizmor, nuclei-templates, splinter, endoflife.date, ScanCode LicenseDB.

Other:

- A prompt per finding for the user's coding agent; opt-in fix pull requests for technical findings, never legal texts.
- Bitbucket, other CI systems, IDE view of SARIF.
- More report languages, DACH legal pages.
- Consent checks after the Digital Omnibus.
- Not planned: what a scan cannot see (NIS2 duties, Data Act, trademarks); a CI network monitor that sends runs to a third party.

## Commercialization

- Free, in this repository: what runs in the user's runner and concerns one run. Every check, SBOM, report JSON, SARIF.
- Paid, a hosted service in its own repository: what needs our infrastructure and remembers across runs. History, a score per site (technical summary, never a legal rating), many sites, notifications, client reports, scheduled scans.
- Distribution: GitHub Marketplace, repository topics, CycloneDX Tool Center.
- The engine has no paid code paths, hooks or feature flags; it only writes the JSON.
- A separate upload step in another repository sends the JSON with a token. Without a token nothing is sent.
- Hosting in the EU and a data processing agreement are part of the offer.

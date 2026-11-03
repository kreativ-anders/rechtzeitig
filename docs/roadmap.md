# Roadmap

Ideas for later.

## Website scan

- Pick sample pages from `sitemap.xml` when there is one, instead of only from the start page's links.
- Cookie banner: are statistics or marketing options preselected?
- Forms: is there a privacy notice next to forms that collect personal data (Art. 13(1) GDPR)?
- Third-country transfers named in the privacy policy (Art. 13(1)(f), Art. 44 ff. GDPR).
- Accessibility basics with axe-core (BFSG).
- Page weight and number of third-party hosts as sustainability checks.
- More languages.

## Repository scan

The action runs inside the user's repository, so it can also read the code.

- SBOM in CycloneDX format from lockfiles, CDN script tags and vendored files.
- Known vulnerabilities from OSV, ranked with CISA KEV and EPSS.
- License conflicts that depend on how the code is shipped: GPL in an MIT library or in a browser bundle fails; GPL used only on your own server is a note; AGPL fails for SaaS too.
- License headers of other projects inside your own files, a sign of copied code.
- Secrets in code and git history, secrets under public prefixes (`NEXT_PUBLIC_`, `VITE_`), `.env` not ignored.
- Open database rules: Supabase tables without row level security, Firebase rules with `if true`.
- Package names that do not exist or look like typos of popular ones.

## Distribution

- Release tags (`v1`) so repositories only change the version.
- Prebuilt container image to skip the browser download.

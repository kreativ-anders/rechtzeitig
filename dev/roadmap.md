# Roadmap

## Website

- After a click on "reject": check that no tracker loads. The only check that would need a click.
- Pick sample pages from `sitemap.xml` when there is one.
- Accessibility with axe-core (BFSG).
- Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
- `security.txt` (RFC 9116).
- More languages.

## Repository

- Secrets in the git history, not only in the current files.
- License headers of other projects inside your own files.
- Package names that do not exist or look like typos of popular ones.
- License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).

## Distribution

- Release tags (`v1`) so repositories only change the version.
- Prebuilt container image to skip the browser download.

# Roadmap

## Website

- After a click on "reject": check that no tracker loads. The only check that would need a click.
- Pick sample pages from `sitemap.xml` when there is one.
- Accessibility with axe-core (BFSG).
- Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
- Total prices including VAT where prices appear (PAngV).
- `cors` with `origin: *` and credentials, admin routes without an auth check.
- `security.txt` (RFC 9116).
- More languages.

## Repository

- Secrets in the git history, not only in the current files.
- License headers of other projects inside your own files.
- Package names that do not exist or look like typos of popular ones.
- License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).

## Findings

- PR annotations for repository findings with file and line.
- Check messages in German, not only titles and fix hints.

## Later, in separate repositories

These need a server and stay out of this repository. This repository stays a self-contained CI tool.

- Dashboard with accounts: history and diff between runs, alerts. The action would upload findings through the interface in `src/sink.ts`, only when the user sets an API key.
- Website checks run from a server in Germany, so consent banners look as they do to visitors from the EU. Rules for these would be data for the same engine, delivered as a signed bundle.

## Distribution

- Release tags (`v1`) so repositories only change the version.
- Prebuilt container image to skip the browser download.

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

- Dashboard with accounts: history and diff between runs, alerts. It receives findings from the existing upload (`upload-url`, `upload-token`, `src/sink.ts`); the engine needs no change for it.
- Website checks run from a server in Germany, so consent banners look as they do to visitors from the EU. Rules for these would be data for the same engine, delivered as a signed bundle.

## Distribution

- First release `v1`, once the checks are stable enough. Until then `examples/workflows/rechtzeitig.yml` points to `kreativ-anders/rechtzeitig@v1`, which does not exist yet; copy it with `@main` to try it. With the release: tag `v1` and a moving major tag, pin the example to the release commit SHA like the other actions, and drop the exception in `src/pinning.test.ts`.
- Prebuilt container image to skip the browser download.

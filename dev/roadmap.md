# Roadmap

rechtzeitig is a CI tool for technical decision makers. The repository scan is the core; the website scan is an add-on that reads the start page and the legal pages, not the whole site. German comes first, but every word of a report comes from `lang/*.yml`, so a new language is one new file.

Items are listed in order of priority.

## Now: v0.1.0

The first pre-release. Not yet alpha or beta.

1. Security fixes from the audit of 2026-11-03:
   - Remove line breaks from untrusted text and escape it before any output (stdout, step summary, SARIF).
   - Skip symlinks and non-regular files in the repository, and read files with a byte limit.
   - Rewrite regular expressions that backtrack badly (`actions-pinning`, `database-rules`, go.mod parser).
   - Put a deadline on every page capture and read probe bodies only up to their limit.
   - Refuse private, loopback and link-local addresses for probes and legal pages. Run probes only against the site that was entered.
   - Run the browser with no downloads, no service workers, a minimal environment and the sandbox where the runner allows it.
2. CI hardening: `persist-credentials: false`, `npm ci --ignore-scripts`, artifact retention, Dependabot cooldown, job timeouts, `SECURITY.md`, CodeQL.
3. Detection fixes found in the review: false negatives (`GPL-*-or-later`, edge-hosted third-country vendors, `.env.*.*`, SPF `+all`, buttons without a link) and false positives (`BSL-1.0`, error pages, short vendor names, register numbers as postcodes, schema-qualified tables, DMARC `sp=`, monorepos). OSV results must never be dropped silently.
4. Lean code: shared helpers in `src/sdk.ts`, checks import only the sdk, patterns and lists move from check code into `data/`.
5. No paid code paths: remove the `tier` field from `rule.yml`.
6. Release: tag `v0.1.0` as a GitHub pre-release, pin `examples/workflows/rechtzeitig.yml` to its commit SHA and drop the exception in `src/pinning.test.ts`. No moving major tag before `v1.0.0`.

## Next: repository

1. PR annotations for repository findings with file and line.
2. Reports fully in the chosen language: messages and details come from `lang/*.yml`, not only titles and fix hints. Check code returns keys and values, never sentences.
3. An input to turn off the OSV lookup, so private package names do not leave the runner.
4. Secrets in the git history, not only in the current files.
5. Package names that do not exist or look like typos of popular ones.
6. License data for ecosystems whose lockfiles have none (Pub, Cargo, PyPI, Go).
7. `cors` with `origin: *` and credentials, admin routes without an auth check.
8. License headers of other projects inside your own files.

## Next: website

Start page and legal pages only. No full-site crawl.

1. After a click on "reject": check that no tracker loads. The only check that would need a click.
2. `security.txt` (RFC 9116), as a probe.
3. Order button labeled "zahlungspflichtig bestellen" for shops (§ 312j BGB).
4. A few unambiguous accessibility checks (BFSG), not a full axe-core run.
5. Total prices including VAT where prices appear (PAngV).

## Later

- More report languages.
- Prebuilt container image to skip the browser download.
- `v1.0.0` with a moving `v1` tag, once the checks are stable.

## Commercialization

None for now. rechtzeitig stays a pure CI tool: no paid features, no paid code paths, no hooks for them in the engine. The repository stays private. Review this section before it goes public.

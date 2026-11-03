# vibecoda

GitHub Action that scans a website and its repository for German legal basics, security and an SBOM. Read README.md, then dev/architecture.md.

- New or changed check: follow dev/writing-checks.md. One folder per check, import only from `src/sdk.ts`, add a row to docs/checks.md.
- Words belong in `lang/*.yml`, services in `data/third-parties.yml`, paths in `data/probes.yml`, secret patterns in `data/secrets.yml`. Never in check code.
- `docs/` is the user documentation (GitHub Pages). `dev/` is for contributors.
- Before you finish: `npm run typecheck && npm test`.
- Docs are English, short and plain.

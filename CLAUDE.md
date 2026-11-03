# vibecoda

GitHub Action that scans a website for German legal basics. Read README.md, then docs/architecture.md.

- New or changed check: follow docs/writing-checks.md. One folder per check, import only from `src/sdk.ts`.
- Words belong in `lang/*.yml`, vendors in `data/third-parties.yml`, never in check code.
- Before you finish: `npm run typecheck && npm test`.
- Docs are English, short and plain.

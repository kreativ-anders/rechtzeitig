# vibecoda

vibecoda is a GitHub Action you start by hand. It opens your website the way a first-time visitor from Germany would and reads your repository. It reports what German and EU law asks for and what is missing:

- imprint and privacy policy (DDG, GDPR)
- servers, cookies and banners before consent (TDDDG)
- cancellation button for subscriptions (BGB)
- security basics: HTTPS, TLS, headers, exposed files, error pages, email spoofing
- an SBOM of your dependencies, known vulnerabilities, license conflicts and committed secrets

It is free and runs on GitHub's runners.

## Start in two minutes

1. Copy [vibecoda.yml](https://github.com/kreativ-anders/vibecoda/blob/main/examples/workflows/vibecoda.yml) to `.github/workflows/vibecoda.yml` in your repository.
2. Open **Actions → vibecoda → Run workflow**, enter your URL and pick the language.
3. Read the report on the run's summary page.

## Read on

- [The workflow](workflow.md): inputs, secrets, `fail-on`, the report files
- [All checks](checks.md): what each one looks for and which law it is about

The results are automated hints, not legal advice.

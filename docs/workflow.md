# The workflow

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `url` | empty | Start page to check. Empty scans only the repository. |
| `language` | `de` | Language of the site: `de`, `en` or `all`. Decides which words count as "Impressum", "Datenschutz" and so on. |
| `subscriptions` | `false` | `true` if visitors can sign up for subscriptions. Turns on the cancellation button check (§ 312k BGB). |
| `sales` | `false` | `true` if consumers buy or sign contracts on the site. Turns on the withdrawal button check (§ 356a BGB). |
| `modules` | all | Comma list of check groups: `legal`, `privacy`, `security`, `sustainability`, `accessibility`, `repo`. |
| `report-language` | `language` | `de` or `en`. Titles and fix hints follow it; check messages are English. |
| `fail-on` | `never` | When the run turns red, see below. |
| `max-pages` | `10` | Pages to visit at most. |
| `repository` | workspace | Folder to read lockfiles, licenses and secrets from. Needs `actions/checkout` before rechtzeitig. |
| `ipinfo-token` | empty | Optional token from [ipinfo.io](https://ipinfo.io) to look up the country of servers rechtzeitig does not know. |
| `upload-url` | empty | Optional HTTPS endpoint that receives the findings after the run, see [Upload](#upload). |
| `upload-token` | empty | Bearer token for `upload-url`. Store it as a secret. |

The output `result` is `pass`, `warn` or `fail`.

## Website, repository or both

The [example workflow](https://github.com/kreativ-anders/rechtzeitig/blob/main/examples/workflows/rechtzeitig.yml) does both. Without `actions/checkout` there is nothing to read, so only the website is checked. Without a URL only the repository is checked.

## fail-on

Every check ends as `pass`, `warn`, `fail`, `info` or `skip`. `fail-on` decides which of these make the run red. The report is the same either way.

| `fail-on` | Run is red when | 1 fail, 2 warn | 0 fail, 2 warn |
|---|---|---|---|
| `never` (default) | never | green | green |
| `fail` | any check fails | red | green |
| `warn` | any check fails or warns | red | red |

The default never turns a run red, so adding rechtzeitig cannot break anything. Choose `fail` once the findings are fixed and you want to keep it that way, or `warn` before a launch.

## Secrets

`IPINFO_TOKEN` is optional. So is `RECHTZEITIG_UPLOAD_TOKEN`, used only for the [upload](#upload). Without it, rechtzeitig knows the country of about 40 common services from its own list. With it, it also looks up the rest.

To add it: repository **Settings → Secrets and variables → Actions → New repository secret**, name `IPINFO_TOKEN`. The free plan is enough.

rechtzeitig sends only the IP addresses of third-party servers to IPinfo, never data about your visitors.

## The report

The summary page of the run shows a table of all checks with details. The artifact `rechtzeitig-report` contains:

| File | Content |
|---|---|
| `rechtzeitig-report.md` | The same report as Markdown |
| `rechtzeitig-report.json` | Findings: rule id, severity, status, message and locations. No page text or file contents |
| `rechtzeitig-sbom.cdx.json` | SBOM in CycloneDX 1.6 format, with vulnerabilities |

Keep the SBOM with each release. It shows which versions you shipped and that you checked them.

## Upload

By default nothing leaves the run. To keep findings somewhere else, for example to compare runs, set both `upload-url` and `upload-token`. The example workflow reads them from the variable `RECHTZEITIG_UPLOAD_URL` and the secret `RECHTZEITIG_UPLOAD_TOKEN`.

After the scan, rechtzeitig sends `rechtzeitig-report.json` as a `POST` with `Content-Type: application/json` and `Authorization: Bearer <token>`. The body contains the scanned URL, the repository name, and per check the rule id, severity, status, message and locations (page URLs, file paths with line numbers, hosts). It never contains page text, file contents, the SBOM or secrets.

The endpoint must use HTTPS. Setting only one of the two inputs stops the run before the scan. A failed upload shows a warning and does not change the result.

## How the website is visited

Each page is loaded twice in a fresh Chromium, once with JavaScript off and once with it on. Nothing is clicked and no consent is given, so every request and cookie in the report happened before consent. rechtzeitig opens the start page, every legal page it finds, a sample of other pages, and a short list of paths that must not be public (`/.env`, `/.git/config`, backups).

GitHub's runners are in US data centers. A site that shows its consent banner only to EU visitors will look different here, and that is a finding in itself. Pages behind a login are not checked.

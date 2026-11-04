# Security policy

## Report a vulnerability

Report it privately as a security advisory: <https://github.com/kreativ-anders/rechtzeitig/security/advisories/new> (or open the repository's **Security** tab and choose **Report a vulnerability**). Please do not open a public issue.

Include what you did, what happened and, if you can, a small site or repository that shows it. We aim to answer within a week and will tell you when a fix is out.

## Supported versions

rechtzeitig is before v1.0.0. Only the latest release gets fixes.

## Scope

rechtzeitig visits websites and reads repositories that it does not control. A vulnerability is anything where that content gets out of the scan, for example:

- a website or repository runs code on the runner, outside the browser sandbox
- scanned content reads or changes files, tokens or secrets of the workflow
- scanned content injects into the job summary, the report or later workflow steps in a way that misleads or harms
- the action or its dependencies send data anywhere other than documented in [docs/workflow.html](docs/workflow.html)

Not in scope: wrong or missing findings (open a normal issue), problems in sites you scan, and attacks that need write access to the workflow or the repository.

There is no bug bounty.

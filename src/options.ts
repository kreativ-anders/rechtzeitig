// Options of the command line entry (src/main.ts). Kept apart so tests can compare them with action.yml.
// An empty value counts as the default (src/main.ts), because runs without the Run workflow dialog pass "".

export const CLI_OPTIONS = {
  url: { type: "string" },
  repo: { type: "string" },
  modules: { type: "string", default: "" },
  subscriptions: { type: "string", default: "false" },
  sales: { type: "string", default: "false" },
  "fail-on": { type: "string", default: "fail" },
  "max-pages": { type: "string", default: "10" },
  vulnerabilities: { type: "string", default: "false" },
  "green-hosting": { type: "string", default: "false" },
  "require-sandbox": { type: "string", default: "true" },
  "allow-private-url": { type: "string", default: "false" },
  sarif: { type: "string", default: "" },
  /** Where to write the report JSON whatever the visibility; empty = only in the artifact (`out`). */
  report: { type: "string", default: "" },
  out: { type: "string", default: "rechtzeitig-report" },
} as const;


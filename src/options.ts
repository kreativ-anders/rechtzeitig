// Options of the command line entry (src/main.ts). Kept apart so tests can compare them with action.yml.

export const CLI_OPTIONS = {
  url: { type: "string" },
  repo: { type: "string" },
  language: { type: "string", default: "de" },
  "report-language": { type: "string", default: "" },
  modules: { type: "string", default: "" },
  subscriptions: { type: "string", default: "false" },
  sales: { type: "string", default: "false" },
  "fail-on": { type: "string", default: "never" },
  "max-pages": { type: "string", default: "10" },
  vulnerabilities: { type: "string", default: "true" },
  "green-hosting": { type: "string", default: "true" },
  "require-sandbox": { type: "string", default: "true" },
  "report-visibility": { type: "string", default: "auto" },
  sarif: { type: "string", default: "" },
  out: { type: "string", default: "rechtzeitig-report" },
} as const;

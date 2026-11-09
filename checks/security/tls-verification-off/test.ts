import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("fails for certificate checks turned off in each language", async () => {
  const result = await runRepoCheck(here, {
    "src/api.ts": "const agent = new https.Agent({ rejectUnauthorized: false });",
    "app/client.py": "r = requests.get(url, verify=False)",
    "cmd/main.go": "tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}",
    "lib/http.php": "curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);",
    "lib/http.rb": "http.verify_mode = OpenSSL::SSL::VERIFY_NONE",
    "scripts/deploy.sh": "curl -sSk https://internal/health",
    ".github/workflows/ci.yml": "env:\n  NODE_TLS_REJECT_UNAUTHORIZED: 0\n",
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => d.file), [".github/workflows/ci.yml", "app/client.py", "cmd/main.go", "lib/http.php", "lib/http.rb", "scripts/deploy.sh", "src/api.ts"]);
});

test("passes for verified connections, comments and tests", async () => {
  const result = await runRepoCheck(here, {
    "src/api.ts": "const agent = new https.Agent({ ca, rejectUnauthorized: true });\n// rejectUnauthorized: false was removed",
    "test/api.test.ts": "const agent = new https.Agent({ rejectUnauthorized: false });",
    "app/auth.py": "jwt.decode(token, verify=False)",
    "scripts/get.sh": "curl -fsSL https://example.org/install.sh -o install.sh",
    "pkg/tlsutil/client.go": "cfg.InsecureSkipVerify = true\ncfg.VerifyPeerCertificate = verifyAgainst(pool)",
  });
  assert.equal(result.status, "pass");
});

test("skips a repository without code", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "# hi" })).status, "skip");
});

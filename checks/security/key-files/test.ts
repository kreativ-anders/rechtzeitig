import { test } from "node:test";
import assert from "node:assert/strict";
import { TOO_LARGE, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

// Built at runtime so no key-like block is committed (dev/writing-checks.md).
const block = (label: string) => ["-----BEGIN", `${label}-----`].join(" ");
const KEY = `${block("PRIVATE KEY")}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n${["-----END", "PRIVATE KEY-----"].join(" ")}\n`;
const RSA = KEY.replace(/PRIVATE KEY/g, "RSA PRIVATE KEY");
const OPENSSH = KEY.replace(/PRIVATE KEY/g, "OPENSSH PRIVATE KEY");
const CERT = `${block("CERTIFICATE")}\nMIIDdzCCAl+gAwIBAgIE\n${["-----END", "CERTIFICATE-----"].join(" ")}\n`;
const SERVICE_ACCOUNT = JSON.stringify({ type: "service_account", project_id: "p", private_key_id: "1", private_key: KEY, client_email: "a@p.iam.gserviceaccount.com" }, null, 2);
const TOKEN = ["npm", "Zr9Lk2", "Qw8Tx4Vb6"].join("");
const SQLITE = "SQLite format 3\0\x10\0\x01\x01\0@  ";
const PKCS12 = "0\x82\x0a\x1e\x02\x01\x030\x82\x09\xe4\x06\x09\0";
const DUMP_HEADER = "-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n--\n-- Host: localhost    Database: shop\n";
const STATE = JSON.stringify({ version: 4, terraform_version: "1.9.0", resources: [{ type: "aws_db_instance", instances: [{ attributes: { password: "x" } }] }] });

const run = (files: Record<string, string>) => runRepoCheck(here, files);

test("passes without key or database files", async () => {
  const result = await run({ "package.json": "{}", "src/index.ts": "export {};\n", ".npmrc": "save-exact=true\n" });
  assert.equal(result.status, "pass");
});

test("fails for a private key in a .pem, .key or id_rsa file, with its line", async () => {
  for (const [file, text] of [["certs/key.pem", KEY], ["deploy/site.key", RSA], [".ssh/id_ed25519", OPENSSH], ["id_rsa", RSA]]) {
    const result = await run({ [file]: text });
    assert.equal(result.status, "fail", file);
    assert.deepEqual(result.raw.details, [{ file, line: 1, key: "private_key" }], file);
  }
  const result = await run({ "certs/server.pem": `${CERT}${KEY}` });
  assert.deepEqual(result.raw.details, [{ file: "certs/server.pem", line: 4, key: "private_key" }]);
});

test("a certificate, a public key or a Keynote file named .key is no find", async () => {
  const keynote = "PK\x03\x04\0\0\x08\0index.apxl";
  const result = await run({ "certs/ca.pem": CERT, "deploy/id_rsa.pub": "ssh-ed25519 AAAAC3Nza user@host\n", "talks/intro.key": keynote, "certs/ca.crt": CERT });
  assert.equal(result.status, "pass");
});

test("fails for a Google service account key, not for other JSON", async () => {
  const bad = await run({ "config/gcp-prod-4f2a.json": SERVICE_ACCOUNT });
  assert.equal(bad.status, "fail");
  assert.deepEqual(bad.raw.details, [{ file: "config/gcp-prod-4f2a.json", line: 2, key: "service_account" }]);
  const noKey = JSON.stringify({ type: "service_account", client_email: "a@p.iam.gserviceaccount.com" });
  assert.equal((await run({ "config/account.json": noKey, "package.json": '{"type":"module"}' })).status, "pass");
});

test("fails for a literal token in .npmrc, not for an environment variable or a comment", async () => {
  const bad = await run({ ".npmrc": `registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${TOKEN}\n` });
  assert.equal(bad.status, "fail");
  assert.deepEqual(bad.raw.details, [{ file: ".npmrc", line: 2, key: "registry_token" }]);
  assert.equal((await run({ "web/.npmrc": "_auth=dXNlcjpwYXNz\n" })).status, "fail");
  for (const line of ["//registry.npmjs.org/:_authToken=${NPM_TOKEN}", '//npm.pkg.github.com/:_authToken="${GITHUB_TOKEN}"', `# //registry.npmjs.org/:_authToken=${TOKEN}`, "//registry.npmjs.org/:_authToken=<your token>", "//registry.npmjs.org/:_authToken=$NPM_TOKEN"]) {
    assert.equal((await run({ ".npmrc": `${line}\n` })).status, "pass", line);
  }
});

test("fails for a password in .pypirc, not for a username alone", async () => {
  assert.equal((await run({ ".pypirc": "[pypi]\nusername = __token__\npassword = pypi-AgEIcHlwaS5vcmcabc\n" })).status, "fail");
  assert.equal((await run({ ".pypirc": "[distutils]\nindex-servers = pypi\n[pypi]\nusername = __token__\n" })).status, "pass");
});

test("fails for a Terraform state with resources, not for an empty one", async () => {
  assert.equal((await run({ "infra/terraform.tfstate": STATE })).status, "fail");
  assert.equal((await run({ "infra/terraform.tfstate.backup": STATE })).status, "fail");
  assert.equal((await run({ "infra/terraform.tfstate": JSON.stringify({ version: 4, terraform_version: "1.9.0", resources: [] }) })).status, "pass");
});

test("warns for binary keystores and database files, not for text files with that name", async () => {
  const result = await run({ "certs/client.p12": PKCS12, "data/app.sqlite": SQLITE, "prisma/dev.db": SQLITE, "backup/prod.dump": "PGDMP\x01\x0e\0\x04\x08" });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details, [
    { file: "backup/prod.dump", key: "database_dump" },
    { file: "certs/client.p12", key: "keystore" },
    { file: "data/app.sqlite", key: "database_file" },
    { file: "prisma/dev.db", key: "database_file" },
  ]);
  assert.equal((await run({ "words.db": "apple\nbanana\n", "Thumbs.db": SQLITE })).status, "pass");
});

test("warns for an SQL dump with rows, not for a schema dump or migrations", async () => {
  const bad = await run({ "backup/shop.sql": `${DUMP_HEADER}CREATE TABLE \`users\` (id int);\nINSERT INTO \`users\` VALUES (1,'Erika Mustermann','erika@example.org');\n` });
  assert.equal(bad.status, "warn");
  assert.deepEqual(bad.raw.details, [{ file: "backup/shop.sql", line: 1, key: "database_dump" }]);
  const pg = "--\n-- PostgreSQL database dump\n--\nCOPY public.customers (id, email) FROM stdin;\n1\ta@b.de\n\\.\n";
  assert.equal((await run({ "db/backup.dump": pg })).status, "warn");
  const structure = "--\n-- PostgreSQL database dump\n--\nCREATE TABLE public.users (id bigint);\nINSERT INTO \"schema_migrations\" (version) VALUES\n('20240101000000');\n";
  const migration = "CREATE TABLE users (id int);\nINSERT INTO users VALUES (1, 'admin');\n";
  assert.equal((await run({ "db/structure.sql": structure, "db/migrate/001_seed.sql": migration })).status, "pass");
});

test("test, example and template paths, fixtures and vendored code are left out", async () => {
  const result = await run({
    "test/certs/server.key": RSA,
    "internal/tls/testdata/key.pem": KEY,
    "examples/service-account.json": SERVICE_ACCOUNT,
    "docs/example.pem": KEY,
    "deploy/server-test.key": RSA,
    "id_rsa.example": RSA,
    ".npmrc.template": `//registry.npmjs.org/:_authToken=${TOKEN}\n`,
    "src/fixtures/db.sqlite": SQLITE,
    "node_modules/pkg/key.pem": KEY,
    "vendor/lib/key.pem": KEY,
  });
  assert.equal(result.status, "pass");
});

test("a fail lists warn finds too", async () => {
  const result = await run({ "server.key": RSA, "data.sqlite": SQLITE });
  assert.equal(result.status, "fail");
  assert.equal(result.raw.details?.length, 2);
});

// "No evidence means pass" review (#85): a dump or database the scan could not read gives no pass.
test("no pass when a dump, database or state file could not be read", async () => {
  const result = await run({ "backup/full.sql": TOO_LARGE, "src/index.ts": "export {};\n" });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["backup/full.sql: Not read: too large or only a Git LFS pointer."]);
  const lfs = await run({ "data/app.sqlite": "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n" });
  assert.equal(lfs.status, "info");
  assert.deepEqual(lfs.details, ["data/app.sqlite: Not read: too large or only a Git LFS pointer."]);
});

test("a large JSON file does not turn the result into info", async () => {
  assert.equal((await run({ "data/countries.json": TOO_LARGE })).status, "pass");
});

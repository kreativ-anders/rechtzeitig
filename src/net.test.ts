import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPublicHost, BlockedHostError, blockedInBrowser, fetchPublic, isPublicAddress } from "./net.ts";
import { scanFixture } from "../test/helpers.ts";

test("private, loopback, link-local and mapped addresses are not public", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "[::1]", "nonsense"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
});

test("the browser blocks localhost and private IP literals, except the trusted host", () => {
  assert.equal(blockedInBrowser("localhost"), true);
  assert.equal(blockedInBrowser("api.localhost"), true);
  assert.equal(blockedInBrowser("169.254.169.254"), true);
  assert.equal(blockedInBrowser("[::1]"), true);
  assert.equal(blockedInBrowser("127.0.0.1", "127.0.0.1"), false);
  assert.equal(blockedInBrowser("example.de"), false);
});

test("hosts are checked after DNS, the trusted host is allowed", async () => {
  await assert.rejects(assertPublicHost("localhost"), BlockedHostError);
  await assert.rejects(assertPublicHost("10.0.0.1"), BlockedHostError);
  await assertPublicHost("127.0.0.1", "127.0.0.1");
  await assertPublicHost("8.8.8.8");
});

test("fetchPublic checks every redirect hop", async () => {
  const server = createServer((_, res) => {
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    const url = `http://127.0.0.1:${port}/`;
    assert.equal((await fetchPublic(url, {}, "127.0.0.1")).res.status, 302);
    await assert.rejects(fetchPublic(url, {}, "127.0.0.1", 5), BlockedHostError);
    await assert.rejects(fetchPublic(url, {}, undefined), BlockedHostError);
  } finally {
    server.close();
  }
});

test("legal links into private networks are not visited", async () => {
  const site = mkdtempSync(join(tmpdir(), "rechtzeitig-ssrf-"));
  writeFileSync(join(site, "index.html"), `<footer><a href="http://169.254.169.254/impressum">Impressum</a><a href="http://localhost:1/datenschutz">Datenschutz</a></footer>`);
  const ctx = await scanFixture(site);
  assert.deepEqual(ctx.pages.map((p) => new URL(p.url).hostname), ["127.0.0.1"]);
});

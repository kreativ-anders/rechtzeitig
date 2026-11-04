import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlockedHostError, fetchPublic, isIpOrLocal, isPublicAddress, pinned, publicAddresses } from "./net.ts";
import { launchBrowser, scan } from "./scan.ts";
import { scanFixture } from "../test/helpers.ts";

test("private, loopback, link-local and mapped addresses are not public", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "[::1]", "nonsense"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
});

test("IP literals and localhost have no domain", () => {
  for (const host of ["127.0.0.1", "[::1]", "::1", "localhost", "app.localhost"]) assert.ok(isIpOrLocal(host), host);
  assert.ok(!isIpOrLocal("example.de"));
});

test("a host is resolved once, and every address must be public unless it is trusted", async () => {
  let calls = 0;
  const answers = [["8.8.8.8"], ["8.8.8.8", "10.0.0.1"], ["127.0.0.1"]];
  const resolve = async () => answers[calls++];
  assert.deepEqual(await publicAddresses("rebind.test", undefined, resolve), ["8.8.8.8"]);
  await assert.rejects(publicAddresses("rebind.test", undefined, resolve), BlockedHostError);
  assert.deepEqual(await publicAddresses("rebind.test", "rebind.test", resolve), ["127.0.0.1"]);
  assert.equal(calls, 3);
  await assert.rejects(publicAddresses("localhost"), BlockedHostError);
  await assert.rejects(publicAddresses("10.0.0.1"), BlockedHostError);
  assert.deepEqual(await publicAddresses("127.0.0.1", "127.0.0.1"), ["127.0.0.1"]);
  assert.deepEqual(await publicAddresses("8.8.8.8"), ["8.8.8.8"]);
});

test("connections go to the checked addresses, the name is not resolved again", async () => {
  const server = createServer((_, res) => res.end("ok"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    // rebind.invalid has no DNS entry; reaching the server proves the pinned address was used.
    const socket = connect({ host: "rebind.invalid", port, lookup: pinned(["127.0.0.1"]) });
    await new Promise<void>((done, fail) => socket.once("connect", done).once("error", fail));
    socket.destroy();
  } finally {
    server.close();
  }
});

test("fetchPublic checks every redirect hop", async () => {
  const server = createServer((_, res) => {
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    // localhost may resolve to ::1 first; the server listens on 127.0.0.1 only, so every address is tried.
    const url = `http://localhost:${port}/`;
    assert.equal((await fetchPublic(url, {}, "localhost")).res.status, 302);
    await assert.rejects(fetchPublic(url, {}, "localhost", 5), BlockedHostError);
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

test("the browser reaches private addresses only on the trusted host, also through redirects", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url === "/redirect") res.writeHead(302, { location: `http://localhost:${port}/leak-redirect` }).end();
    else res.writeHead(200, { "content-type": "text/html" }).end(`<img src="http://localhost:${port}/leak-name"><img src="/redirect">`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  const browser = await launchBrowser();
  try {
    // Not offline: nothing aborts requests in the browser, only the proxy decides.
    await scan(`http://127.0.0.1:${port}/`, { browser, maxPages: 1, timeout: 10_000 });
    assert.ok(hits.includes("/redirect"));
    assert.deepEqual(hits.filter((h) => h.startsWith("/leak")), []);
  } finally {
    await browser.close();
    server.close();
  }
});

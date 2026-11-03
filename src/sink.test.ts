import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { artifactSink, chooseSink, httpSink, type Findings } from "./sink.ts";

const findings: Findings = {
  version: "0.0.0",
  startedAt: "2026-11-03T00:00:00.000Z",
  target: { url: "https://example.de/" },
  results: [{ rule: "SEC-TEST-001", check: "security/test", severity: "low", status: "pass", message: "ok", locations: [] }],
};

async function server(status: number) {
  const received: { headers?: IncomingHttpHeaders; body?: string } = {};
  const s = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => Object.assign(received, { headers: req.headers, body }) && res.writeHead(status).end());
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/findings`, received, close: () => s.close() };
}

test("httpSink posts the findings as JSON with the bearer token", async () => {
  const s = await server(204);
  try {
    await httpSink(s.url, "t0ken").send(findings);
    assert.equal(s.received.headers?.authorization, "Bearer t0ken");
    assert.equal(s.received.headers?.["content-type"], "application/json");
    assert.deepEqual(JSON.parse(s.received.body!), findings);
  } finally {
    s.close();
  }
});

test("httpSink fails when the endpoint answers with an error", async () => {
  const s = await server(401);
  try {
    await assert.rejects(httpSink(s.url, "wrong").send(findings), /401/);
  } finally {
    s.close();
  }
});

test("httpSink refuses plain HTTP to other hosts", () => {
  assert.throws(() => httpSink("http://example.de/findings", "t"), /https/);
  assert.doesNotThrow(() => httpSink("https://example.de/findings", "t"));
});

test("chooseSink sends nothing without both inputs and refuses only one of them", () => {
  assert.equal(chooseSink(undefined, undefined), artifactSink);
  assert.throws(() => chooseSink("https://example.de/findings", undefined), /both/);
  assert.throws(() => chooseSink(undefined, "t"), /both/);
  assert.equal(chooseSink("https://example.de/findings", "t").name, "example.de");
});

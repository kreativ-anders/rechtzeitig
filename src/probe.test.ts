import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { probe } from "./probe.ts";

test("probes read a capped body from a server that never stops sending", async () => {
  const chunk = "A=1\n".repeat(16_384);
  const server = createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    const send = () => {
      while (res.write(chunk));
      res.once("drain", send);
    };
    send();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    const started = Date.now();
    const env = (await probe(`http://127.0.0.1:${port}`, "test", 5000, "127.0.0.1")).find((p) => p.path === "/.env");
    assert.equal(env?.body.length, 50_000);
    assert.equal(env?.exposed, true);
    assert.ok(Date.now() - started < 5000);
    const blocked = await probe(`http://127.0.0.1:${port}`, "test", 5000);
    assert.ok(blocked.every((p) => p.status === 0), "only the trusted host may be local");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

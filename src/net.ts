// Keeps requests on the public internet. The scanned site decides where links and redirects point;
// without this, it could make the runner call its own network (cloud metadata, local services).
// Every connection goes to the address that was checked, so a DNS answer that changes between check
// and connect (DNS rebinding) cannot reach a private address. The browser connects through publicProxy().
// The host of the URL the user passed is always allowed, so local dev servers and test fixtures work.

import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, connect, createServer, isIP, type LookupFunction, type Socket } from "node:net";
import { Readable } from "node:stream";

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32],
] as const) PRIVATE.addSubnet(net, prefix, "ipv6");

export class BlockedHostError extends Error {}

const bare = (host: string) => host.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "").replace(/\.$/, "");
const isLocalName = (host: string) => host === "localhost" || host.endsWith(".localhost");

/** False for loopback, private, link-local, CGNAT, multicast and reserved addresses, also as IPv4-mapped IPv6. */
export function isPublicAddress(ip: string): boolean {
  const a = bare(ip);
  const family = isIP(a);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)?.[1];
  if (mapped) return isPublicAddress(mapped);
  return !PRIVATE.check(a, family === 4 ? "ipv4" : "ipv6");
}

/** true for IP literals (also [::1]) and `localhost`: hosts without a domain to check. */
export const isIpOrLocal = (host: string): boolean => {
  const h = bare(host);
  return isLocalName(h) || isIP(h) > 0;
};

const resolveAll = async (host: string): Promise<string[]> => (await lookup(host, { all: true })).map((a) => a.address);

/**
 * The addresses of `host`, resolved once. Throws BlockedHostError unless the host is `trusted`
 * or every address is public. Connect to these addresses, never to the name again.
 */
export async function publicAddresses(host: string, trusted?: string, resolve = resolveAll): Promise<string[]> {
  const h = bare(host);
  const allowed = !!trusted && h === bare(trusted);
  if (!allowed && isLocalName(h)) throw new BlockedHostError(`${h} is a local address`);
  const addresses = isIP(h) ? [h] : await resolve(h);
  const inner = allowed ? undefined : addresses.find((a) => !isPublicAddress(a));
  if (inner) throw new BlockedHostError(`${h} resolves to the non-public address ${inner}`);
  if (!addresses.length) throw new Error(`${h} has no address`);
  return addresses;
}

/** True when publicAddresses passes. DNS errors count as not allowed. */
export const isPublicHost = (host: string, trusted?: string) => publicAddresses(host, trusted).then(() => true, () => false);

/**
 * A `lookup` for net, tls and http that answers with addresses checked before, so the name is not resolved again.
 * They still try every address (IPv6 and IPv4), and SNI and the Host header keep the name.
 */
export const pinned = (addresses: string[]): LookupFunction => (_host, options, callback) => {
  const all = addresses.map((address) => ({ address, family: isIP(address) }));
  if (options.all) callback(null, all);
  else callback(null, all[0].address, all[0].family);
};

export interface PublicInit {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * GET that connects only to checked addresses and follows at most `redirects` redirects by hand,
 * checking each hop. Returns the last response and its URL.
 */
export async function fetchPublic(url: string | URL, init: PublicInit, trusted: string | undefined, redirects = 0): Promise<{ res: Response; url: string }> {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    const res = await get(current, init, trusted);
    const location = res.headers.get("location");
    if (hop >= redirects || res.status < 300 || res.status >= 400 || !location) return { res, url: current.href };
    await res.body?.cancel();
    current = new URL(location, current);
  }
}

const NO_BODY = new Set([204, 205, 304]);

async function get(url: URL, { headers = {}, signal }: PublicInit, trusted?: string): Promise<Response> {
  const https = url.protocol === "https:";
  if (!https && url.protocol !== "http:") throw new Error(`unsupported protocol ${url.protocol}`);
  const lookup = pinned(await publicAddresses(url.hostname, trusted));
  return new Promise((resolve, reject) => {
    const req = (https ? httpsRequest : httpRequest)(url, { headers, signal, lookup, agent: false }, (msg: IncomingMessage) => {
      try {
        const status = msg.statusCode ?? 0;
        const all = new Headers();
        for (let i = 0; i < msg.rawHeaders.length; i += 2) all.append(msg.rawHeaders[i], msg.rawHeaders[i + 1]);
        resolve(new Response(NO_BODY.has(status) ? null : (Readable.toWeb(msg) as ReadableStream), { status, headers: all }));
      } catch (e) {
        msg.destroy();
        reject(e);
      }
    });
    req.on("error", reject).end();
  });
}

/**
 * A local SOCKS5 proxy for the browser. Chromium sends host names to a SOCKS5 proxy and does no DNS itself,
 * so every page, redirect, subresource and WebSocket connects to an address publicAddresses checked.
 */
export async function publicProxy(trusted?: string): Promise<{ server: string; close: () => void }> {
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    sockets.add(client);
    client.on("close", () => sockets.delete(client)).on("error", () => client.destroy());
    let buf = Buffer.alloc(0);
    let greeted = false;
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (!greeted) {
        // Greeting: version 5, number of methods, methods. Answer: no authentication.
        if (buf.length < 2 || buf.length < 2 + buf[1]) return;
        if (buf[0] !== 5) return client.destroy();
        buf = buf.subarray(2 + buf[1]);
        greeted = true;
        client.write(Buffer.from([5, 0]));
      }
      const target = socksTarget(buf);
      if (!target) return;
      client.off("data", onData).pause();
      void open(client, target, buf.subarray(target.size), trusted, sockets);
    };
    client.on("data", onData);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  return {
    server: `socks5://127.0.0.1:${port}`,
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}

interface SocksTarget {
  command: number;
  host: string;
  port: number;
  /** Bytes of the request. */
  size: number;
}

/** Parses a SOCKS5 request (version, command, reserved, address type, address, port); undefined while incomplete. */
function socksTarget(buf: Buffer): SocksTarget | undefined {
  if (buf.length < 5) return undefined;
  const type = buf[3];
  const length = type === 1 ? 4 : type === 4 ? 16 : type === 3 ? 1 + buf[4] : -1;
  if (length < 0) return { command: 0, host: "", port: 0, size: buf.length };
  const size = 4 + length + 2;
  if (buf.length < size) return undefined;
  const raw = buf.subarray(4, 4 + length);
  const host = type === 1 ? raw.join(".")
    : type === 4 ? Array.from({ length: 8 }, (_, i) => raw.readUInt16BE(2 * i).toString(16)).join(":")
    : raw.subarray(1).toString();
  return { command: buf[1], host, port: buf.readUInt16BE(size - 2), size };
}

// Reply codes: 0 success, 2 not allowed, 4 host unreachable, 7 command not supported.
const answer = (code: number) => Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0]);

async function open(client: Socket, target: SocksTarget, rest: Buffer, trusted: string | undefined, sockets: Set<Socket>) {
  if (target.command !== 1) return client.end(answer(7));
  let addresses: string[];
  try {
    addresses = await publicAddresses(target.host, trusted);
  } catch (e) {
    return client.end(answer(e instanceof BlockedHostError ? 2 : 4));
  }
  const upstream = connect({ host: target.host, port: target.port, lookup: pinned(addresses) });
  sockets.add(upstream);
  upstream.on("close", () => {
    sockets.delete(upstream);
    client.destroy();
  });
  upstream.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
  upstream.once("connect", () => {
    client.write(answer(0));
    if (rest.length) upstream.write(rest);
    client.pipe(upstream).pipe(client);
  });
}

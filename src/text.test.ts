import { test } from "node:test";
import assert from "node:assert/strict";
import { siteOf } from "./text.ts";

test("siteOf keeps ordinary registrable domains", () => {
  assert.equal(siteOf("www.example.de"), "example.de");
  assert.equal(siteOf("example.de"), "example.de");
  assert.equal(siteOf("WWW.Example.DE"), "example.de");
  assert.equal(siteOf("a.b.example.co.uk"), "example.co.uk");
  assert.equal(siteOf("shop.example.com.au"), "example.com.au");
});

test("siteOf separates tenants of private suffixes (Public Suffix List, private section)", () => {
  assert.equal(siteOf("shop.azurewebsites.net"), "shop.azurewebsites.net");
  assert.notEqual(siteOf("shop.azurewebsites.net"), siteOf("tracker.azurewebsites.net"));
  assert.equal(siteOf("d111.cloudfront.net"), "d111.cloudfront.net");
  assert.equal(siteOf("x.github.io"), "x.github.io");
  assert.notEqual(siteOf("x.github.io"), siteOf("y.github.io"));
  assert.equal(siteOf("a.b.netlify.app"), "b.netlify.app");
  assert.equal(siteOf("my.vercel.app"), "my.vercel.app");
  assert.equal(siteOf("my.pages.dev"), "my.pages.dev");
  assert.equal(siteOf("my.web.app"), "my.web.app");
  assert.equal(siteOf("my.herokuapp.com"), "my.herokuapp.com");
});

test("siteOf separates registrations under ccTLD second levels", () => {
  assert.equal(siteOf("www.shop.co.za"), "shop.co.za");
  assert.notEqual(siteOf("shop.co.za"), siteOf("tracker.co.za"));
});

test("siteOf applies wildcard and exception rules", () => {
  // *.ck: every second level is a suffix; !www.ck: except www.ck itself.
  assert.equal(siteOf("a.b.c.ck"), "b.c.ck");
  assert.equal(siteOf("www.ck"), "www.ck");
  assert.equal(siteOf("x.www.ck"), "www.ck");
});

test("siteOf falls back to the last two labels for unknown suffixes", () => {
  assert.equal(siteOf("a.b.example.invalidtld"), "example.invalidtld");
});

test("siteOf leaves IP addresses, single labels and suffixes alone", () => {
  assert.equal(siteOf("192.168.0.1"), "192.168.0.1");
  assert.equal(siteOf("[::1]"), "[::1]");
  assert.equal(siteOf("2001:db8::1"), "2001:db8::1");
  assert.equal(siteOf("localhost"), "localhost");
  assert.equal(siteOf("co.uk"), "co.uk");
  assert.equal(siteOf("github.io"), "github.io");
});

test("siteOf ignores a trailing dot", () => {
  assert.equal(siteOf("www.example.de."), "example.de");
  assert.equal(siteOf("shop.azurewebsites.net."), "shop.azurewebsites.net");
});

test("siteOf matches internationalized suffixes in ASCII and Unicode form", () => {
  // 個人.香港 is a suffix in the ICANN section; URL.hostname gives the punycode form.
  const ascii = new URL("http://a.b.個人.香港/").hostname;
  assert.equal(siteOf(ascii), new URL("http://b.個人.香港/").hostname);
  assert.equal(siteOf("a.b.個人.香港"), new URL("http://b.個人.香港/").hostname);
});

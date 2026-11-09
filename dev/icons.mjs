// Renders docs/favicon.svg to the raster icons and docs/og.png from dev/og-image.html.
// Run after changing the seal: node dev/icons.mjs
// favicon.ico holds PNG images (16, 32, 48 px), which every current browser reads.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const docs = new URL("../docs/", import.meta.url);
const svg = readFileSync(new URL("favicon.svg", docs)).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();

/** The seal as PNG, `size` px square; `background` fills the corners (apple-touch-icon has no transparency). */
async function png(size, background = "transparent") {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:${background}}img{display:block}</style><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}">`);
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: background === "transparent" });
}

/** An ICO file that wraps PNG images. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e);
    head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

writeFileSync(new URL("favicon-32.png", docs), await png(32));
writeFileSync(new URL("apple-touch-icon.png", docs), await png(180, "#8a1c2b"));
const images = [];
for (const size of [16, 32, 48]) images.push({ size, data: await png(size) });
writeFileSync(new URL("favicon.ico", docs), ico(images));

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(new URL("og-image.html", import.meta.url).href);
await page.screenshot({ path: new URL("og.png", docs).pathname });
await browser.close();

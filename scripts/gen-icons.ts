import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/** Rasterize build/icon.svg → build/icon.png (1024px). electron-builder
 *  generates the platform .icns/.ico from this PNG. */
const svg = readFileSync(resolve("build/icon.svg"), "utf8");
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
const png = resvg.render().asPng();
const outPath = resolve("build/icon.png");
writeFileSync(outPath, png);
// eslint-disable-next-line no-console
console.log(`Wrote ${outPath} (${String(png.length)} bytes)`);

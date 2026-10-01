// Browser checks against the built package: dist/ and wasm/ in a real Chrome.
//
// What the Node tests cannot see, because each of these was a defect only a
// running renderer showed: a tap mirrored about the horizontal axis, a heap that
// could not grow past 256 MB, a runtime abort nobody was told about, and the
// camera feed's texture path.
//
//   npm run build && node test/browser/run.mjs
//
// Needs playwright-core (not a dependency of this package) and a Chrome:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core  (else a normal import)
//   CHROME=/path/to/chrome  (default: the macOS Google Chrome.app)
//   VIRO_WASM_DIR=/path/to/build  (serve that renderer build instead of wasm/)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const { chromium } = process.env.PLAYWRIGHT_CORE
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href)
  : await import("playwright-core");

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".data": "application/octet-stream",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = url.pathname === "/" ? "test/browser/harness.html" : url.pathname.slice(1);
  // VIRO_WASM_DIR serves another build as wasm/ (e.g. to confirm these checks
  // fail against the binary before a fix).
  const file = process.env.VIRO_WASM_DIR && rel.startsWith("wasm/")
    ? path.join(path.resolve(process.env.VIRO_WASM_DIR), rel.slice(5))
    : path.join(PKG, rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
function check(ok, name, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => window.viroReady === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  // 1. Taps land where they are drawn. The box draws from 28% to 41% of the
  //    way down; its mirror image about the horizontal midline is at ~66%.
  await page.mouse.click(256, 512 * 0.66);
  await page.waitForTimeout(100);
  const mirrored = await page.evaluate(() => window.viroChecks.clicks());
  await page.mouse.click(256, 512 * 0.34);
  await page.waitForTimeout(100);
  const direct = await page.evaluate(() => window.viroChecks.clicks()) - mirrored;
  check(mirrored === 0, "a tap on the box's mirror image does not hit it", `clicks ${mirrored}`);
  check(direct === 1, "a tap on the box hits it", `clicks ${direct}`);

  // 2. Source texture: created, filled, and refilled at the same size.
  const src = await page.evaluate(() => window.viroChecks.sourceTexture());
  check(src.created && src.first && src.second, "source texture created and filled twice", JSON.stringify(src));
  await page.waitForTimeout(300);
  const shot = await page.locator("#c").screenshot();
  const { PNG } = (() => {
    // Beside playwright-core when it came from elsewhere, else a normal resolve.
    const from = process.env.PLAYWRIGHT_CORE ?? PKG;
    try { return createRequire(path.resolve(from, "index.js"))("pngjs"); } catch { return {}; }
  })();
  if (PNG) {
    const png = PNG.sync.read(shot);
    const at = (x, y) => {
      const i = (png.width * Math.round(y * png.height) + Math.round(x * png.width)) * 4;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };
    const [r, g, b] = at(0.5, 0.66);
    check(g > 150 && r < 100 && b < 100, "the textured box shows the source's second frame", `rgb ${r},${g},${b}`);
  } else {
    console.log("  skip pixel check (pngjs not installed)");
  }

  // 2b. Both texture paths the same way up (left box: bytes, right: source).
  await page.evaluate(() => window.viroChecks.orientation());
  await page.waitForTimeout(300);
  if (PNG) {
    const png = PNG.sync.read(await page.locator("#c").screenshot());
    const px = (x, y) => {
      const i = (png.width * Math.round(y * png.height) + Math.round(x * png.width)) * 4;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };
    // Find each box's vertical extent along its centre column, then sample
    // a quarter of the way in from its top and bottom edges.
    const topBottom = (x) => {
      let top = -1, bottom = -1;
      for (let y = 0; y < png.height; y++) {
        const [r, g, b] = px(x, y / png.height);
        if (r + g + b > 60) { if (top < 0) top = y; bottom = y; }
      }
      const h = bottom - top;
      return [px(x, (top + h * 0.25) / png.height), px(x, (top + h * 0.75) / png.height)];
    };
    const redOverBlue = ([t, b]) => t[0] > t[2] && b[2] > b[0];
    const bytesUp = topBottom(0.5 - 0.17);
    const sourceUp = topBottom(0.5 + 0.17);
    check(redOverBlue(bytesUp) === redOverBlue(sourceUp),
      "source texture is the same way up as the byte path",
      `bytes ${JSON.stringify(bytesUp)} source ${JSON.stringify(sourceUp)}`);
  }

  // 3. The heap grows: 320 MB of held textures, past the old fixed 256 MB.
  const grew = await page.evaluate(() => {
    try { return { n: window.viroChecks.allocate(20, 16) }; } catch (e) { return { error: String(e) }; }
  });
  check(grew.n === 20, "the heap grows past 256 MB", JSON.stringify(grew));
  check((await page.evaluate(() => window.viroChecks.aborts())).length === 0, "no abort while growing");

  // 4. Past the 2 GB ceiling the runtime aborts, and the renderer says so.
  const past = await page.evaluate(() => {
    try { window.viroChecks.allocate(40, 64); return "no throw"; } catch (e) { return String(e); }
  });
  const aborts = await page.evaluate(() => window.viroChecks.aborts());
  const abortedWith = await page.evaluate(() => window.viroChecks.abortedWith());
  check(/Aborted|OOM|memory/i.test(past), "allocation past the ceiling fails", past.slice(0, 80));
  check(aborts.length === 1, "onAbort called exactly once", JSON.stringify(aborts));
  check(abortedWith !== null, "renderer.abortedWith is set", String(abortedWith));

  // 5. A tracking dropout holds the pose instead of snapping to identity.
  //    Fresh page: the one above has aborted, and initAR is one-way.
  if (PNG) {
    const ar = await browser.newPage({ viewport: { width: 512, height: 512 } });
    await ar.goto(base);
    await ar.waitForFunction(() => window.viroReady === true, null, { timeout: 30000 });
    // Horizontal centre of the target box, from its row (28-41% down).
    const boxX = async () => {
      await ar.waitForTimeout(250);
      const png = PNG.sync.read(await ar.locator("#c").screenshot());
      const y = Math.round(0.34 * png.height);
      let sum = 0, n = 0;
      for (let x = 0; x < png.width; x++) {
        const i = (png.width * y + x) * 4;
        if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 300) { sum += x; n++; }
      }
      return n ? sum / n / png.width : -1;
    };
    const NORMAL = 3, LIMITED = 2, UNAVAILABLE = 1;
    await ar.evaluate((s) => window.viroChecks.arPose(s, 0), NORMAL);
    const atZero = await boxX();
    await ar.evaluate((s) => window.viroChecks.arPose(s, 12), NORMAL);
    const tracked = await boxX();
    await ar.evaluate((s) => window.viroChecks.arPose(s, -40), UNAVAILABLE);
    const held = await boxX();
    await ar.evaluate((s) => window.viroChecks.arPose(s, 6), LIMITED);
    const limited = await boxX();
    const near = (a, b) => Math.abs(a - b) < 0.01;
    check(atZero > 0 && tracked > 0 && !near(atZero, tracked), "a Normal pose moves the content",
      `x ${atZero.toFixed(3)} -> ${tracked.toFixed(3)}`);
    check(near(held, tracked), "Unavailable holds the last pose (no snap to identity)",
      `held ${held.toFixed(3)}, tracked ${tracked.toFixed(3)}, identity ${atZero.toFixed(3)}`);
    check(!near(limited, tracked) && !near(limited, atZero), "Limited applies the new rotation",
      `x ${limited.toFixed(3)}`);
    await ar.close();
  }

  if (failed) console.log(logs.slice(-20).join("\n"));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.log(`browser: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("browser: all checks passed");

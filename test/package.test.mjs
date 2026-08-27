/**
 * What the published tarball has to be true of, checked before it is published.
 *
 * These are cheap and they cover the two ways this package has actually been
 * wrong: the shipped binary drifting from the TypeScript that declares it, and
 * an asset going out that is not ours to redistribute.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p);

// --- The public surface loads and is complete -------------------------------
const api = await import("../dist/index.js");
for (const name of [
  "ViroWebRenderer", "loadViroWebModule", "ViroSceneApi", "ViroArSession",
  "requestDeviceMotionPermission", "ViroTrackingState", "ViroLightingModel",
  "SlamStatus", "SlamPlaneType", "VIRO_INVALID_HANDLE",
]) {
  assert.ok(name in api, `dist/index.js does not export ${name}`);
}
console.log(`  ok  public exports (${Object.keys(api).length} names)`);

// --- The WASM assets are present and shaped as the loader expects -----------
for (const f of ["wasm/viro-web.js", "wasm/viro-web.wasm", "wasm/viro-web.data"]) {
  assert.ok(existsSync(root + f), `${f} is missing -- run npm run copy-wasm`);
}
const glue = read("wasm/viro-web.js").toString();
assert.ok(
  glue.includes("export default"),
  "the glue must be an ES module: loader.ts imports it and reads .default",
);
console.log("  ok  wasm assets present, glue is an ES module");

// --- Every binding types.ts declares exists in the binary -------------------
// The .d.ts is a promise about a file built somewhere else, and nothing but
// this checks that the two were built from the same tree.
const wasm = read("wasm/viro-web.wasm").toString("latin1");
const declared = [
  ...read("src/types.ts").toString().matchAll(/^ +(viro[A-Za-z0-9]+)\??\(/gm),
].map((m) => m[1]);
assert.ok(declared.length > 50, `only found ${declared.length} bindings in types.ts`);
const missing = [...new Set(declared)].filter((n) => !wasm.includes(`\0${n}\0`) && !wasm.includes(n));
assert.deepEqual(missing, [], `types.ts declares bindings the binary does not export`);
console.log(`  ok  all ${new Set(declared).size} declared bindings exist in viro-web.wasm`);

// --- Nothing in the payload is someone else's to give away ------------------
// viro-web.data used to carry Apple/Linotype's Helvetica, ~2.3 MB of a 2.4 MB
// file, because it is what virocore's preload directory happened to contain.
// The font is now DejaVu Sans, under the Bitstream Vera license, and its
// licence text is preloaded beside it so the binary cannot be copied to a CDN
// and leave the notice behind.
const data = read("wasm/viro-web.data").toString("latin1");
for (const forbidden of ["Helvetica", "Linotype"]) {
  assert.ok(
    !data.includes(forbidden),
    `viro-web.data contains "${forbidden}" -- this package may not redistribute it`,
  );
}
assert.ok(data.includes("DejaVu Sans"), "viro-web.data should carry DejaVu Sans");
assert.ok(
  data.includes("Bitstream Vera Fonts Copyright"),
  "the font's licence must travel inside the .data with the font",
);
console.log("  ok  bundled font is redistributable and carries its licence");

// --- The licence files the package claims actually ship ---------------------
const pkg = JSON.parse(read("package.json").toString());
for (const f of ["LICENSE", "THIRD-PARTY-LICENSES.md"]) {
  assert.ok(existsSync(root + f), `${f} is missing`);
  assert.ok(pkg.files.includes(f), `package.json "files" does not include ${f}`);
}
console.log("  ok  LICENSE and THIRD-PARTY-LICENSES.md ship");

console.log("package: all checks passed");

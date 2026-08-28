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

// --- The WASM assets ---------------------------------------------------------
// These live outside git: they are built from virocore and copied in. CI has no
// virocore, so their absence is reported and skipped rather than failed --
// except at publish time, where prepublishOnly runs copy-wasm first and sets
// VIRO_REQUIRE_WASM, so a missing binary is the error it should be.
const haveWasm = ["wasm/viro-web.js", "wasm/viro-web.wasm", "wasm/viro-web.data"]
  .every((f) => existsSync(root + f));

if (!haveWasm) {
  if (process.env.VIRO_REQUIRE_WASM) {
    assert.fail("WASM assets are missing -- run npm run copy-wasm");
  }
  console.log("  --  WASM assets absent, skipping binary checks (run npm run copy-wasm)");
} else {
  const glue = read("wasm/viro-web.js").toString();
  assert.ok(
    glue.includes("export default"),
    "the glue must be an ES module: loader.ts imports it and reads .default",
  );
  console.log("  ok  wasm assets present, glue is an ES module");

  // Every binding types.ts declares exists in the binary. The .d.ts is a promise
  // about a file built somewhere else, and nothing but this checks that the two
  // were built from the same tree.
  const wasm = read("wasm/viro-web.wasm").toString("latin1");
  const declared = [
    ...read("src/types.ts").toString().matchAll(/^ +(viro[A-Za-z0-9]+)\??\(/gm),
  ].map((m) => m[1]);
  assert.ok(declared.length > 50, `only found ${declared.length} bindings in types.ts`);
  const missing = [...new Set(declared)].filter((n) => !wasm.includes(n));
  assert.deepEqual(missing, [], "types.ts declares bindings the binary does not export");
  console.log(`  ok  all ${new Set(declared).size} declared bindings exist in viro-web.wasm`);

  // A font is preloaded. Which font is an open question for the team; that the
  // renderer has one at all is not -- ViroText aborts at runtime without it.
  const data = read("wasm/viro-web.data").toString("latin1");
  assert.ok(
    /Helvetica|DejaVu Sans/.test(data),
    "viro-web.data carries no recognisable font -- ViroText would abort at runtime",
  );
  console.log("  ok  a font is preloaded in viro-web.data");
}

const pkg = JSON.parse(read("package.json").toString());

// --- The bundled tracking engine ---------------------------------------------
// Web AR ships in the tarball rather than being fetched from a repository the
// consumer may not be able to open. Same provisioning as the renderer binaries:
// git-ignored, copied in by a script, shipped via "files".
const haveSlam = ["slam/tinyvio-slam.js", "slam/tinyvio-slam.wasm"]
  .every((f) => existsSync(root + f));

if (!haveSlam) {
  if (process.env.VIRO_REQUIRE_WASM) {
    assert.fail("the tracking engine is missing -- run npm run copy-slam");
  }
  console.log("  --  tracking engine absent, skipping its checks (run npm run copy-slam)");
} else {
  // It must NOT be an ES module: slamLoader injects it as a classic script and
  // reads the global it leaves behind. An EXPORT_ES6 build would load without
  // error and never define SlamModule.
  const slamGlue = read("slam/tinyvio-slam.js").toString();
  assert.ok(
    !/^export default/m.test(slamGlue) && slamGlue.includes("SlamModule"),
    "the engine must be the classic-script build that defines SlamModule",
  );

  // Every member ViroArSession drives, present in the engine binary.
  const slamWasm = read("slam/tinyvio-slam.wasm").toString("latin1");
  const drives = [
    "SlamEngine", "configure", "start", "stop", "feedImu", "allocFrameBuffer",
    "processFrame", "poseQx", "poseQy", "poseQz", "poseQw", "posePx", "posePy",
    "posePz", "trackingQuality", "getStatus", "fetchPlanes", "planeId",
    "planeCenterX", "planeCenterY", "planeCenterZ", "planeNormalX",
    "planeNormalY", "planeNormalZ", "planeExtentX", "planeExtentZ",
    "planeType", "planeConfidence",
  ];
  const absent = drives.filter((n) => !slamWasm.includes(n));
  assert.deepEqual(absent, [], "the engine does not expose what ViroArSession drives");
  console.log(`  ok  bundled tracking engine exposes all ${drives.length} members driven`);

  assert.ok(pkg.files.includes("slam"), 'package.json "files" must include slam');

  // slam/package.json scopes the directory to CommonJS. The package root is
  // "type": "module", and without the marker Node reads the UMD glue as ESM and
  // cannot load it at all -- which is invisible in a browser, where a <script>
  // tag never consults package.json, and fatal anywhere else.
  const slamPkg = JSON.parse(read("slam/package.json").toString());
  assert.equal(slamPkg.type, "commonjs", "slam/package.json must scope the dir to CommonJS");

  // And the engine actually runs. Everything above checks that bytes are where
  // they should be; this is the only check that the bytes do anything. It drives
  // the same calls ViroArSession makes on a live frame.
  const { createRequire } = await import("node:module");
  const requireFromRoot = createRequire(new URL("../", import.meta.url));
  const SlamModule = requireFromRoot("./slam/tinyvio-slam.js");
  const engine = await SlamModule({ locateFile: (f) => root + "slam/" + f });
  const e = new engine.SlamEngine();
  e.configure(452.5, 452.5, 320, 240, 640, 480, 0, 0, 0, 0,
              15, 5e-3, 5e-2, 5e-4, 1e-2, 8, 15, 5, 0, 0, 0, 1);
  e.start();
  const ptr = e.allocFrameBuffer(640 * 480);
  engine.HEAPU8.fill(0, ptr, ptr + 640 * 480);
  assert.equal(e.processFrame(640, 480, 640, 0.033), 0, "processFrame reported an error");
  assert.equal(typeof e.poseQw(), "number", "the engine returned no pose");
  assert.equal(typeof e.poseConfidence(), "number", "the tinyvio extensions are missing");
  e.stop();
  e.delete();
  console.log("  ok  bundled engine configures, processes a frame and reports a pose");
}

// --- The licence files the package claims actually ship ---------------------
for (const f of ["LICENSE", "THIRD-PARTY-LICENSES.md"]) {
  assert.ok(existsSync(root + f), `${f} is missing`);
  assert.ok(pkg.files.includes(f), `package.json "files" does not include ${f}`);
}
console.log("  ok  LICENSE and THIRD-PARTY-LICENSES.md ship");

console.log("package: all checks passed");

<p align="center" style="background-colour: #CCCCCC;">
  <a href="https://www.reactvision.xyz/">
    <img src="https://avatars.githubusercontent.com/u/74572641?s=200&v=4" alt="ReactVision logo" width="120px" height="120px">
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@reactvision/viro-web-renderer">
    <img src="https://img.shields.io/npm/v/@reactvision/viro-web-renderer" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/@reactvision/viro-web-renderer">
    <img src="https://img.shields.io/npm/dm/@reactvision/viro-web-renderer?colour=purple" alt="downloads">
  </a>
  <a href="https://discord.gg/A6TaFNqwVc">
    <img src="https://img.shields.io/discord/774471080713781259?label=Discord" alt="Discord">
  </a>
</p>

# ViroReact Web Renderer, By ReactVision

WebAssembly + WebGL2 build of the Viro renderer (`virocore`) for the web platform. This package ships the compiled `.wasm` module, its Emscripten glue, and a typed loader, scene API and AR session on top. It is what [ViroReact](https://github.com/ReactVision/viro) renders through on the web.

MIT licensed and free forever.

> **Used automatically by [`@reactvision/react-viro`](https://www.npmjs.com/package/@reactvision/react-viro) on the web** — install it alongside the core package and the web navigators pick it up. You can also drive it directly, which is what the rest of this document covers.

> **Web AR is included.** Pose tracking and plane detection come from tinyvio, ReactVision's visual-inertial tracker, and this package ships it — 260 KB of WASM under `slam/`. Nothing else to install or host.

## Supported Browsers

| Browser              | Support      |
| -------------------- | ------------ |
| Chrome / Edge        | ✅ Supported |
| Safari (iOS + macOS) | ✅ Supported |
| Firefox              | ✅ Supported |

3D scenes need WebGL2 and nothing else. **AR additionally requires HTTPS and a device with an IMU** — the camera and DeviceMotion are both gated on a secure context.

Single-threaded — no pthreads, so `SharedArrayBuffer` and COOP/COEP headers are **not** required.

## How it works

The renderer is `virocore`, the same C++ engine ViroReact runs natively on iOS, Android, Apple Vision Pro and Meta Quest, compiled to WebAssembly and drawing through WebGL2. It draws; it does not track.

- **Scene graph** — a handle-based C API (`ViroSceneApi`) that the ViroReact web bridge's reconciler drives from your JSX. Nodes, geometries, materials, lights, textures, portals, particles and animations are all created and mutated through opaque integer handles owned by the WASM module.
- **AR** — poses come from tinyvio, a second WASM module, running in JS alongside this one. `ViroArSession` captures the camera and IMU, feeds the tracker, converts the pose from the tracker's Z-up/OpenCV frame into virocore's Y-up/GL frame, and injects it through the AR scene API.
- **Assets** — the module is three files: `viro-web.js` (glue), `viro-web.wasm`, and `viro-web.data` (preloaded shaders and font). All three must be reachable at runtime; see [Bundler integration](#bundler-integration).
- **Text renders in Roboto**, preloaded into `viro-web.data` and redistributed with this package under the Apache 2.0 licence. It is the same face Viro renders text in on Android and Quest, so the three agree; iOS uses the system font.

## Installation

```bash
npm install @reactvision/viro-web-renderer
```

ESM only. `main`, `module` and `types` all point at `dist/`, and there is no CommonJS build — `require()` will not work. Deep imports (`@reactvision/viro-web-renderer/wasm/viro-web.wasm`) are supported and are how the bundler recipes below reach the assets.

## Usage

```ts
import { ViroWebRenderer } from "@reactvision/viro-web-renderer";

const renderer = await ViroWebRenderer.create({
  canvas: document.getElementById("myCanvas"), // must be attached to the DOM
});

window.addEventListener("resize", () => renderer.resize());
```

The canvas must be in the document at `create()` time — the WebGL2 context is created C-side from a CSS selector. If the canvas has no `id`, one is assigned.

`create()` gives you an empty scene; build into it through `renderer.scene`:

```ts
const s = renderer.scene;
const material = s.createMaterial();
s.setMaterialDiffuseColor(material, 0.2, 0.6, 1.0, 1.0);

const box = s.createBox(2, 2, 2);
s.setGeometryMaterial(box, material);

const node = s.createNode();
s.setNodeGeometry(node, box);
s.setNodePosition(node, 0, 0, -5);
s.addChildNode(s.getRootNode(), node);
```

## API

- `ViroWebRenderer.create(options)` → `Promise<ViroWebRenderer>`
  - `options.canvas` — `HTMLCanvasElement | string` (element or CSS selector)
  - `options.width?`, `options.height?` — backing-store size in device pixels (defaults to CSS size × `devicePixelRatio`)
  - `options.locateFile?`, `options.assetBaseUrl?`, `options.importGlue?` — where the WASM assets are; see [Bundler integration](#bundler-integration)
  - `options.onAbort?` — called once with a `ViroRendererAbortError` if the WASM runtime aborts (out of memory, most often). Terminal for that renderer
- `renderer.scene` — `ViroSceneApi`, the handle-based scene graph
- `renderer.resize(width?, height?)` — resize the viewport
- `renderer.canvasSize` — backing-store size in device pixels
- `renderer.loadModel(node, bytes, format, resources?)` — GLB / glTF / VRX / OBJ; `resources` is `{ name, bytes }[]` (an OBJ's `.mtl` and the textures it names, or a VRX's PNGs)
- `renderer.loadLightingEnvironment(url)` / `renderer.clearLightingEnvironment()` — radiance `.hdr` as an IBL environment
- `renderer.addAbortListener(fn)` → unsubscribe, and `renderer.abortedWith` — the abort, once it has happened
- `renderer.dispose()` — release references and detach input (see the note below)
- `renderer.canvasElement`, `renderer.wasmModule` — the bound canvas, and the raw Emscripten module as an escape hatch
- `loadViroWebModule(canvas, opts?)` — low-level module loader

> **`dispose()` does not stop the render loop.** It releases references and detaches input, but the WASM main loop cannot be cancelled from the C API yet, so a disposed renderer keeps drawing. Create one renderer and keep it rather than mounting and unmounting repeatedly.

## Bundler integration

Three things a consumer's bundler must handle to run the ViroReact web bridge:

1. **Platform resolution** — resolve `.web.tsx`/`.web.ts` before the native files.
2. **`react-native` → `react-native-web`** alias.
3. **The WASM assets** — reachable at runtime. How you point the renderer at them depends on the bundler.

> **Known issue (tracked for 3.0.3):** the Vite and webpack recipes below are not validated against the published `@reactvision/react-viro` 3.0.2, and they fail with it. Its `dist/` ships JSX untranspiled inside `.js` files, and `dist/index.js` pulls in `require("react-native/Libraries/Image/AssetSourceResolver")`, which `react-native-web` cannot satisfy. This package itself is unaffected; the bridge's own harness (`viro/web-harness/`) consumes the viro source tree.

The glue is imported dynamically; by default it self-resolves the sidecars relative to its own URL, which works for plain ESM. Bundlers that rewrite `import.meta.url` need one of:

- **`importGlue` + `locateFile`** — import each file with the bundler's asset syntax and hand back the URLs. Best for Vite and webpack.
- **`assetBaseUrl`** (or `globalThis.VIRO_WEB_ASSET_BASE`) — a directory URL where the three files are served, e.g. copied into `public/` or a CDN.

### Vite

```ts
import glueUrl from "@reactvision/viro-web-renderer/wasm/viro-web.js?url";
import wasmUrl from "@reactvision/viro-web-renderer/wasm/viro-web.wasm?url";
import dataUrl from "@reactvision/viro-web-renderer/wasm/viro-web.data?url";

const webRendererOptions = {
  importGlue: () => import(/* @vite-ignore */ glueUrl),
  locateFile: (p: string) =>
    p.endsWith(".wasm") ? wasmUrl : p.endsWith(".data") ? dataUrl : p,
};
// vite.config: resolve.extensions = [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"]
//              resolve.alias = { "react-native": "react-native-web" }
//              optimizeDeps.exclude = ["@reactvision/viro-web-renderer"]
```

Pass `webRendererOptions` to `Viro3DSceneNavigator` or `ViroARSceneNavigator` on web.

### webpack 5

```js
// webpack.config.js
resolve: {
  extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"],
  alias: { "react-native$": "react-native-web" },
},
module: {
  rules: [{ test: /viro-web\.(wasm|data)$/, type: "asset/resource" }],
},
```

```ts
import wasmUrl from "@reactvision/viro-web-renderer/wasm/viro-web.wasm";
import dataUrl from "@reactvision/viro-web-renderer/wasm/viro-web.data";
// importGlue: () => import("@reactvision/viro-web-renderer/wasm/viro-web.js"); locateFile as above
```

The glue is not covered by the asset rule, so webpack bundles it: importing it statically yields the module's default export (the factory), not a URL. Let `importGlue` import the module itself, as above, or add `viro-web\.js` to the `asset/resource` rule and import its URL.

### Metro / Expo web

```js
// metro.config.js
config.resolver.assetExts.push("wasm", "data");
// react-native-web alias + .web resolution are Expo web defaults.
```

Then serve the three files from a known path — copy them to the app's `public/` — and set `assetBaseUrl` to that directory. Metro's asset pipeline for arbitrary imported binaries is less flexible than webpack's or Vite's, so `assetBaseUrl` is the most reliable route there.

The glue is fetched at runtime rather than bundled, and on Metro it has to be:
a dynamic `import()` with a non-literal specifier is rejected at build time, and
the `webpackIgnore` comment that excuses it elsewhere is stripped by
`babel-preset-expo` before Metro's dependency collector runs. The loader
therefore reaches it through an indirection no bundler parses, so an Expo web
app builds without any configuration beyond the two lines above.

**That indirection needs `unsafe-eval`.** Under a strict Content-Security-Policy,
pass `importGlue` instead and let your own bundler resolve the module:

```js
import glueUrl from "@reactvision/viro-web-renderer/wasm/viro-web.js?url";

await ViroWebRenderer.create({
  canvas,
  importGlue: () => import(/* @vite-ignore */ glueUrl),
  assetBaseUrl: "/wasm/",
});
```

## AR (`ViroArSession`)

Web AR needs a second WASM module. The renderer draws the scene from a pose someone else computed; that someone is tinyvio, ReactVision's visual-inertial tracker, which does the 6-DoF tracking and plane detection. Most apps get this through the bridge's `ViroARSceneNavigator` on web; the low-level API below is for custom hosts.

### The tracking engine

The engine is tinyvio, and it ships in
this package under `slam/`. `ViroArSession` loads it on `start()` with no
configuration: there is nothing to install, nothing to host, and no second
repository to clone.

It is not an ES module — tinyvio builds it deliberately as a classic script that
leaves a `SlamModule` factory behind — so the session injects a `<script>` tag
rather than importing it. That matters in one case: if your bundler moves the
files, tell the session where they went.

```ts
// only if the two files are not where the package put them
new ViroArSession({ sceneApi, slamBaseUrl: "/assets/tinyvio/" });
// or globally: globalThis.VIRO_SLAM_ASSET_BASE = "/assets/tinyvio/";
```

To run a different build entirely — one you compiled, or one you already loaded
— pass `loadSlam` and the bundled copy is left alone.

> **The `Slam*` names are the name of a C API, not of the engine behind it.**
> tinyvio replaced an earlier tracker and kept that API on purpose, so nothing
> written against it had to change.

```ts
import { ViroWebRenderer, ViroArSession } from "@reactvision/viro-web-renderer";

const renderer = await ViroWebRenderer.create({ canvas });

const session = new ViroArSession({
  sceneApi: renderer.scene,
  detectPlanes: true,
  onStatus: (state, quality, detail) => {/* 1 Unavailable / 2 Limited / 3 Normal, debounced out of Normal; detail: { confidence, reason } */},
  onAnchorsUpdated: (planes) => {/* ArPlaneAnchor[] in Y-up world space */},
  onError: (err) => {/* shown to the user */},
});

await session.start();               // needs a user gesture (camera + iOS motion perm)
const hits = session.hitTest(x, y, canvas.width, canvas.height); // ray-vs-plane
session.stop();                      // releases camera + tears down the tracker
```

Through the bridge, `ViroARSceneNavigator` uses this bundled engine by default; pass `slamScriptUrl` only to load a different build, and it does the script injection for you.

`start()` **rejects** when it cannot start, after calling `onError`. Both happen: `onError` is where a UI shows the reason, and the rejection is what stops an `await session.start()` from continuing as though a session existed.

`requestDeviceMotionPermission()` is exported to request iOS Safari's DeviceMotion permission from a tap.

### What the tracking state does and does not tell you

`onStatus` reports virocore's three values, which are coarser than what tinyvio knows. A `Normal` can be a pose that is six-degree-of-freedom but not yet metric: content placed by `hitTest` is right, content placed at "1.5 metres" is not. tinyvio exposes that as `poseConfidence`, and whether a reported ground plane was detected or assumed as `groundIsEstimated`. `poseConfidence` reaches `onStatus` as `detail.confidence` (`PositionNoScale` means not yet metric); **`groundIsEstimated` is not surfaced yet.** Without the detail, read `Normal` as "drawing is reasonable", not as "the world is measured".

Two more things worth knowing before you rely on a number:

- **`ArPlaneAnchor.width`/`height` are a bounding box.** tinyvio detects a boundary polygon; the C API carries only a centre and two extents, so the polygon is reduced on the way here. The box is never smaller than the surface and on a room-sized floor can be noticeably larger — fine for placing an object on, misleading if you draw it.
- **Five of the eight `SlamTuning` knobs do nothing.** tinyvio is keyframe-and-bundle-adjustment rather than a filter, so the IMU noise densities have no counterpart and are accepted and ignored; `lostRecovery` is not read at all. `fastThreshold`, `lostThreshold` and `lostGrace` do take effect. The fields stay because the C API has them, and each is annotated in the type.

Supplying real `intrinsics` matters more than any of the tuning. Without them the session falls back to a measured guess (`f = 0.707 × long axis`), and the frustum, the tracking and the hit test are all built on it.

### Replaying a recording

`ViroArSession` can replay a recorded session instead of tracking a live one: frames come from a video, poses from an array, and the caller steps one frame at a time. The camera, the tracking engine and the IMU listener are all bypassed — everything downstream is untouched, so a scene composited this way is composited exactly as it would be on a device.

```ts
const session = new ViroArSession({
  sceneApi: renderer.scene,
  playback: {
    videoUrl: "/recording/video.mp4",
    frames: [{ t: 0.0, q: [0, 0, 0, 1], p: [0, 0, 0], tracked: true }, /* ... */],
    intrinsics: { fx: 1357.41, fy: 1357.41, cx: 960, cy: 720 },
    intrinsicsSize: { width: 1920, height: 1440 },
    intrinsicsRotation: -90,
  },
});
await session.start();
for (let i = 0; i < session.playbackFrameCount; i++) {
  await session.renderPlaybackFrame(i);   // resolves once that frame is decoded
  // ...capture the canvas here
}
session.stop();
```

Three things worth knowing:

- **The poses are computed offline**, not re-tracked here — in practice by tinyvio's replay tool over the recording's video and IMU. That keeps this deterministic and quick, and keeps two questions apart: whether tracking held is answered by the analysis that produced the poses, and this only answers what the scene looks like on top of it.
- **They must already be in virocore space** (Y-up/GL). A tracker's own frame is usually Z-up/OpenCV; the conversion the live path applies is `FRAME_Q` and `CAM_FLIP` in `arSession.ts`. Applying half of it produces a world that is almost right, which is the kind of bug that survives review.
- **`renderPlaybackFrame` awaits the decoder** before returning, so a caller can screenshot immediately after without racing it. A frame with `tracked: false` is injected as `Unavailable`, which holds the last tracked pose and leaves the camera feed alone — what a device does through a dropout, rather than drawing content against a pose that does not exist.

## Local development

The `.wasm` and glue are produced from `virocore/wasm`, then copied into this package:

```bash
cd ../virocore/wasm && ./build_web.sh   # produces products/build/viro-web.*
cd ../../tinyvio && ./scripts/build_slam_wasm.sh   # produces web/slam/tinyvio-slam.*
cd ../viro-web-renderer
npm run copy-wasm                       # renderer  -> ./wasm
npm run copy-slam                       # tracker   -> ./slam
npm run build                           # tsc       -> ./dist
npm test
```

`npm run copy-wasm` reads from `../virocore/wasm/products/build` by default; override with `VIRO_WASM_BUILD=/path npm run copy-wasm`. `dist/`, `wasm/` and the `slam/` binaries are git-ignored and regenerated from source, and all three ship to npm — `prepublishOnly` rebuilds and re-copies them, so a publish from a clean clone cannot ship a package without a renderer in it.

To try the example scene:

```bash
npm run build && npm run copy-wasm && npm run copy-slam
python3 -m http.server 8080
# open http://localhost:8080/example/
```

`npm test` runs three suites. `test/hitTest.test.mjs` round-trips a point through the projection and back out through `hitTest`, which is the property that broke when the renderer started using real camera intrinsics. `test/session.test.mjs` covers `ViroArSession`. `test/package.test.mjs` checks the tarball's invariants: the public exports load, the glue is an ES module, and every binding `types.ts` declares exists in the shipped binary. `npm run test:browser` runs the checks that need a real Chrome (taps, the heap, the abort, source textures, dropout holding).

## Licensing

This package is MIT, and so is the bundled tracking engine (tinyvio, also ReactVision's). The renderer binaries statically link libjpeg, FreeType, Bullet, protobuf-lite, zlib, SDL2 and the Emscripten runtime — all permissive, all with their notices in [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md). If you copy the binaries to a CDN, that file is the notice to keep with them.

## Documentation

- ViroReact docs: <https://viro-community.readme.io/docs/overview>

## Community

Discord is the best place to find the team and other developers building with ViroReact:

<a href="https://discord.gg/A6TaFNqwVc">
  <img src="https://discordapp.com/api/guilds/774471080713781259/widget.png?style=banner2" />
</a>

## Find Out More

- Website: <https://reactvision.xyz>
- ViroReact: <https://reactvision.xyz/viro-react>
- ReactVision Studio: <https://studio.reactvision.xyz>
- Blog: <https://updates.reactvision.xyz>

---

MIT licensed. © ReactVision, Inc.

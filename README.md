# @reactvision/viro-web-renderer

WebAssembly + WebGL2 build of the Viro renderer (`virocore`) for the web
platform. This package ships the compiled `.wasm` module, its Emscripten glue,
and a small typed loader / init API. It is consumed by the Viro web bridge
(`react-native-web` layer) in Phase 2.

> Status: **Phase 3.** Ships the typed scene C API (`ViroSceneApi`) driven by the
> Viro web bridge, plus `ViroArSession` for web AR (camera + 6-DoF pose + plane
> detection via slam-wasm). A `viroBuildDemoCube()` smoke-test scene is still
> available.

## Install

```sh
npm install @reactvision/viro-web-renderer
```

## Usage

```ts
import { ViroWebRenderer } from "@reactvision/viro-web-renderer";

const renderer = await ViroWebRenderer.create({
  canvas: document.getElementById("myCanvas"), // must be attached to the DOM
});

window.addEventListener("resize", () => renderer.resize());
```

The canvas must be in the document at `create()` time — the WebGL2 context is
created C-side from a CSS selector. If the canvas has no `id`, one is assigned.

### API

- `ViroWebRenderer.create(options)` → `Promise<ViroWebRenderer>`
  - `options.canvas`: `HTMLCanvasElement | string` (element or CSS selector)
  - `options.width?`, `options.height?`: backing-store size in device pixels
    (defaults to CSS size × `devicePixelRatio`)
  - `options.locateFile?`: override `.wasm`/`.data` URL resolution (bundler use)
- `renderer.resize(width?, height?)` — resize the viewport
- `renderer.canvasElement` — the bound canvas
- `renderer.wasmModule` — the raw Emscripten module (escape hatch)
- `loadViroWebModule(canvas, locateFile?)` — low-level module loader

## How the WASM is built

The `.wasm` / glue are produced from `virocore/wasm` (see that repo's
`MIGRATION.md`), then copied into this package:

```sh
cd ../virocore/wasm && ./build_web.sh      # produces products/build/viro-web.*
cd ../../viro-web-renderer
npm run copy-wasm                          # copies artifacts into ./wasm
npm run build                              # tsc -> dist
```

`npm run copy-wasm` reads from `../virocore/wasm/products/build` by default;
override with `VIRO_WASM_BUILD=/path npm run copy-wasm`.

## Try the example

```sh
npm run build && npm run copy-wasm
python3 -m http.server 8080
# open http://localhost:8080/example/
```

## Publishing (manual, Phase 1)

```sh
npm run copy-wasm && npm run build
npm publish --access public
```

`dist/` and `wasm/` are shipped (see `files` in `package.json`); both are
git-ignored and regenerated from source.

## Bundler integration

Three things a consumer's bundler must handle to run the Viro web bridge:

1. **Platform resolution** — resolve `.web.tsx`/`.web.ts` before the native files.
2. **`react-native` → `react-native-web`** alias.
3. **The WASM assets** — `viro-web.js` (glue), `viro-web.wasm`, `viro-web.data`
   must be reachable at runtime. How you point the renderer at them depends on
   the bundler (see `ViroWebRendererOptions`: `importGlue`, `assetBaseUrl`,
   `locateFile`).

**No cross-origin isolation needed.** This build is single-threaded (no pthreads),
so `SharedArrayBuffer` and COOP/COEP headers are **not** required.

### Loading the WASM assets

The glue is imported dynamically; by default it self-resolves the sidecars
relative to its own URL (works for plain ESM). Bundlers that rewrite
`import.meta.url` need one of:

- **`importGlue` + `locateFile`** — import each file with the bundler's asset
  syntax and hand back the URLs. Best for Vite/webpack.
- **`assetBaseUrl`** (or `globalThis.VIRO_WEB_ASSET_BASE`) — a directory URL
  where the three files are served (e.g. copied into `public/` or a CDN).

#### Vite (validated)

```ts
import glueUrl from "@reactvision/viro-web-renderer/wasm/viro-web.js?url";
import wasmUrl from "@reactvision/viro-web-renderer/wasm/viro-web.wasm?url";
import dataUrl from "@reactvision/viro-web-renderer/wasm/viro-web.data?url";

const webRendererOptions = {
  importGlue: () => import(/* @vite-ignore */ glueUrl),
  locateFile: (p: string) =>
    p.endsWith(".wasm") ? wasmUrl : p.endsWith(".data") ? dataUrl : p,
};
// vite.config: resolve.extensions = [".web.tsx", ".web.ts", ".tsx", ".ts", ...]
//              resolve.alias = { "react-native": "react-native-web" }
//              optimizeDeps.exclude = ["@reactvision/viro-web-renderer"]
```

Pass `webRendererOptions` to `Viro3DSceneNavigator` (web).

#### webpack 5

```js
// webpack.config.js
resolve: {
  extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"],
  alias: { "react-native$": "react-native-web" },
},
module: {
  rules: [
    { test: /viro-web\.(wasm|data)$/, type: "asset/resource" },
  ],
},
```
```ts
import glueUrl from "@reactvision/viro-web-renderer/wasm/viro-web.js";
import wasmUrl from "@reactvision/viro-web-renderer/wasm/viro-web.wasm";
import dataUrl from "@reactvision/viro-web-renderer/wasm/viro-web.data";
// importGlue: () => import(/* webpackIgnore: true */ glueUrl); locateFile as above
```

#### Metro / Expo web

```js
// metro.config.js
config.resolver.assetExts.push("wasm", "data");
// react-native-web alias + .web resolution are Expo web defaults.
```
Then serve the three files from a known path (e.g. copy to the app's `public/`)
and set `assetBaseUrl` to that directory. Metro's asset pipeline for arbitrary
`import`ed binaries is less flexible than webpack/Vite, so the `assetBaseUrl` +
`public/` approach is the most reliable there.

## AR (`ViroArSession`)

Web AR is driven by a second WASM module, [slam-wasm](../slam), which does the
6-DoF tracking + plane detection. This package provides `ViroArSession`: it
captures the camera + IMU, feeds slam, converts the pose from slam's Z-up/OpenCV
frame to virocore's Y-up/GL frame, and injects it into the renderer via the AR
scene API (`ViroSceneApi.arSet*`). Most apps use it indirectly through the Viro
bridge's `ViroARSceneNavigator.web`; the low-level API is here for custom hosts.

```ts
import { ViroWebRenderer, ViroArSession } from "@reactvision/viro-web-renderer";

const renderer = await ViroWebRenderer.create({ canvas });

const session = new ViroArSession({
  sceneApi: renderer.scene,
  // slam-wasm factory. With the classic <script> build: () => globalThis.SlamModule
  loadSlam: () => import("/slam_wasm.mjs"),
  detectPlanes: true,
  onStatus: (state, quality) => {/* 1 Unavailable / 2 Limited / 3 Normal */},
  onAnchorsUpdated: (planes) => {/* ArPlaneAnchor[] in Y-up world space */},
});

await session.start();               // needs a user gesture (camera + iOS motion perm)
const hits = session.hitTest(x, y, canvas.width, canvas.height); // ray-vs-plane
session.stop();                      // releases camera + tears down slam
```

`requestDeviceMotionPermission()` is exported to request iOS Safari's DeviceMotion
permission from a tap. The camera feed, pose tracking, and plane detection all
require **HTTPS** and a device with an IMU. See
[`viro/WEB_AR.md`](../viro/WEB_AR.md) for the full component-level guide.

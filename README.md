# @reactvision/viro-web-renderer

WebAssembly + WebGL2 build of the Viro renderer (`virocore`) for the web
platform. This package ships the compiled `.wasm` module, its Emscripten glue,
and a small typed loader / init API. It is consumed by the Viro web bridge
(`react-native-web` layer) in Phase 2.

> Status: **Phase 1 (productizing the renderer).** Initialization currently
> builds a demo scene (a spinning cube). The declarative scene / component API
> lands with the Phase 2 bridge.

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

## Bundler notes

The Emscripten glue is imported dynamically and its `.wasm`/`.data` sidecars are
resolved relative to the glue URL. Under a bundler you may need to emit `.wasm`
and `.data` as assets and serve COOP/COEP-free (this build is single-threaded,
so `SharedArrayBuffer` / cross-origin isolation is **not** required). Full
Metro/webpack config lands with the Phase 2 bridge.

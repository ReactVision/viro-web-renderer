# Release Notes

## 1.0.1

Fixes found running the web player against real scenes. The compiled renderer in this release is virocore 3.0.2; the new calls fall back to the old path on an older binary, but the heap, tap and dropout fixes live in the binary and need this one.

### Fixed

- **Large models no longer kill the renderer.** The heap was fixed at 256 MB, and a 30 to 40 MB generated GLB crossed it once decoded; `abort("OOM")` is permanent, so every later call failed and the canvas stayed black. The heap now grows to 2 GB, and glTF loads no longer copy the model.
- **An abort is reported.** `onAbort` in the options, `renderer.addAbortListener()` and `renderer.abortedWith`. Model loads in flight settle as failed.
- **Model files leave the virtual FS once loaded,** instead of staying in JS memory for the life of the page.
- **Taps land where they are drawn.** They were mirrored about the horizontal axis.
- **Web AR holds its pose through a dropout** instead of snapping to a default orientation. tinyvio's `poseConfidence` decides the state: RotationOnly applies rotation and holds position, None holds the last pose.
- **The pose is smoothed** with a One Euro filter (`poseSmoothing`, or `false` for the raw solve), and `onStatus` is debounced out of Normal and carries `confidence` and `reason`.
- **The camera feed draws from the stream** at `feedWidth`/`feedHeight` (default 1280x960) through a source texture, with no per-frame readback; the tracker gets a downscaled copy.

### Added

- `PoseConfidence`, `TrackingReason`, `PoseFilter`, `ViroRendererAbortError`; `ViroSceneApi.createSourceTexture` and `updateTextureFromSource`.

## 1.0.0

First published release. The Viro renderer — the same C++ engine ViroReact runs natively on iOS, Android, Apple Vision Pro and Meta Quest — compiled to WebAssembly and drawing through WebGL2.

This package ships the compiled module, its Emscripten glue, and a typed loader, scene API and AR session on top. It is what [ViroReact](https://github.com/ReactVision/viro) renders through on the web: install it alongside `@reactvision/react-viro` and the web navigators pick it up. You can also drive it directly.

### Web AR is included

Pose tracking and plane detection come from [tinyvio](https://github.com/ReactVision/tinyvio), ReactVision's own visual-inertial tracker, and it ships **inside this package** — 260 KB of WASM under `slam/`, loaded by `ViroArSession.start()` with no configuration. There is no second module to obtain or host.

`ViroArSession` captures the camera and IMU, feeds the tracker, converts the pose from the tracker's Z-up/OpenCV frame into the renderer's Y-up/GL frame, and injects it. A playback mode replays a recorded session instead of tracking a live one.

### Requirements

| | |
|---|---|
| Browsers | Chrome, Edge, Safari (iOS + macOS), Firefox |
| 3D scenes | WebGL2, and nothing else |
| AR | additionally HTTPS and a device with an IMU — camera and DeviceMotion are both gated on a secure context |
| Threading | single-threaded: `SharedArrayBuffer` and COOP/COEP headers are **not** required |
| Modules | ESM only. There is no CommonJS build; `require()` will not work |

The module is three files — `viro-web.js`, `viro-web.wasm` and `viro-web.data` — and all three must be reachable at runtime. Bundler recipes are in the README.

### Text renders in Roboto

Preloaded into `viro-web.data` and redistributed under Apache 2.0. It is the same face Viro renders text in on Android and Quest, so the three agree; iOS uses the system font.

### Known limits

- `dispose()` settles in-flight model loads and clears its handler maps, but it cannot stop the WASM main loop. That is a limitation of the C API, and it is documented rather than implied.
- Five of the eight `SlamTuning` fields and all four `SlamIntrinsics` distortion coefficients are accepted and ignored by the tracker.
- `onStatus`'s `Normal` does not mean the world is metric, and `ArPlaneAnchor.width` / `height` are a bounding box over a polygon, not the polygon itself.
- The glue module is reached through an indirection so that bundlers can parse it, and that indirection needs `unsafe-eval`. A page under a strict CSP should pass `importGlue` instead.

### Licensing

MIT, and so is the bundled tracker. The binaries statically link libjpeg, FreeType, Bullet, protobuf-lite, zlib, SDL2 and the Emscripten runtime — all permissive, all credited in [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md). If you copy the binaries to a CDN, that file is the notice to keep with them.

---

The full engineering detail for this release, including what was fixed between the last internal build and this publish, is in [`CHANGELOG.md`](./CHANGELOG.md).

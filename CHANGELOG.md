# Changelog

## 0.1.0

First published release.

WebAssembly + WebGL2 build of the Viro renderer for the web: the compiled
module, the typed scene API (`ViroSceneApi`) the Viro web bridge drives, and
`ViroArSession` for web AR — camera, 6-DoF pose and plane detection through
tinyvio — plus a playback mode that
replays a recorded session instead of tracking a live one.

Everything below happened between the last internal build and this publish, and
is listed because someone tracking the package from inside will otherwise be
surprised by it.

### Fixed before publishing

Two things that would each have made this release wrong.

The binary shipped Helvetica, baked into `viro-web.data` by the preload step and
therefore redistributed with the package. It renders in **Roboto** now, which is
Apache 2.0 and is also what Viro renders text in on Android and Quest — so the
web player agrees with them instead of being a third typeface. The data blob
drops from 2.3 MB to 389 KB.

And the compiled module was older than the API declared over it: eleven
bindings — the physics and light-shadow calls, the particle and collision ones —
existed in `types.ts` and in no build. Every one of them would have been
`undefined` at runtime. Rebuilt from virocore; the package's own test now
checks all 126, and that the preloaded font is one this package may ship.

### Added

- **The tracking engine ships with the package.** Web AR needed a second WASM
  module that every consumer had to obtain and host themselves, from a
  repository most of them could not open. tinyvio is now bundled under `slam/`
  (260 KB of WASM plus 41 KB of glue) and `ViroArSession` loads it on `start()`
  with no configuration. `loadSlam` becomes optional; `slamBaseUrl` is there for
  bundlers that move the files.

- **`intrinsicsSize` on the live path.** A calibration is measured at the
  sensor's full resolution and `getUserMedia` hands over something far smaller,
  so the measured focal has to be scaled onto the delivered frame — 1920×1440
  against a 640×480 capture is a focal three times too long, which misplaces
  content and reads as a tracking fault rather than a unit mismatch. The
  playback path already did this; the live path took the numbers as-is.

### Fixed

- **`hitTest` unprojected through the wrong frustum.** It assumed a fixed
  60-degree vertical field of view, which stopped matching the renderer when
  virocore started building its projection from the camera's real intrinsics —
  which `ViroArSession` always supplies. On the default 640×480 capture that
  camera is 55.6 degrees, and the principal point was ignored entirely. The ray
  now comes from the same intrinsics, off-axis and aspect-widened exactly as
  `VROARCameraWeb::getProjection` does it.

  Worth knowing where the old error landed: scaling a ray's x and y by the same
  factor does not move where it crosses a horizontal plane laterally, so a tap
  on the floor still put the object under the finger. It went into depth
  instead — about 0.18 m at 2.2 m. Right direction, wrong distance.

- **`session.start()` resolved after failing.** On the live path a denied
  camera called `onError` and then resolved, so `await session.start()`
  continued as though a session existed. It now rejects, as the playback path
  already did.

- **`renderPlaybackFrame` could hang forever.** It waited for a `seeked` that
  never comes when the video is already at that timestamp — a repeated frame
  time, or a caller re-rendering the frame it just rendered — and had no path
  out of a decode error either.

- **A superseded `loadModel` promise never settled.** A second load on the same
  node replaced the first resolver and orphaned it; the native callback carries
  only the node handle, so it could never arrive for the load that was replaced.

### Changed

- **`dispose()`** now settles in-flight model loads as failed and clears its
  handler maps. It still cannot stop the WASM main loop — that is a C API
  limitation, and it is documented rather than implied.

### Documentation

- The AR docs described `slam-wasm`, a predecessor engine, including an ESM
  build and an `@reactvision/slam-web` npm package that do not exist. tinyvio's
  engine is a classic `<script>` exposing a `SlamModule` global, built from
  `scripts/build_slam_wasm.sh`, and the README now says how to get it. Some of
  this was shipping inside the published `.d.ts`.
- The knobs that do nothing now say so: five of the eight `SlamTuning` fields
  and all four `SlamIntrinsics` distortion coefficients are accepted and ignored
  by tinyvio.
- `onStatus`'s `Normal` does not mean the world is metric, and
  `ArPlaneAnchor.width`/`height` are a bounding box over a polygon. Both are now
  stated where a caller will read them.

### Packaging

- `LICENSE` and `THIRD-PARTY-LICENSES.md` ship. The package declared MIT while
  carrying statically linked libjpeg, FreeType, Bullet, protobuf-lite, zlib and
  SDL2, none of them credited.
- `prepublishOnly` re-copies the WASM and runs the tests. `wasm/` is
  git-ignored, so a publish from a clean clone would otherwise have shipped a
  package with no renderer in it and no error.
- `publishConfig.access` is `public`; the repository URL is HTTPS; `engines`,
  `author`, `homepage` and `bugs` are filled in.
- There are tests now: a `hitTest` round trip, and a tarball check that the
  public exports load and that every binding `types.ts` declares exists in the
  shipped binary.

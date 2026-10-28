/**
 * What the session hands the renderer and the UI each frame, driven by a fake
 * engine so every tracker state can be produced on demand.
 *
 * The renderer draws Normal with the full pose, keeps the rotation on Limited
 * and holds everything on Unavailable. These checks pin the session's side of
 * that contract: a relocalising frame whose rotation tinyvio still vouches for
 * goes through as Limited, a frame it does not is held, and the UI's state does
 * not flash through a short dropout.
 */
import assert from "node:assert/strict";
import { ViroArSession, PoseConfidence, SlamStatus, cameraFromDeviceQuat, deviceGyro } from "../dist/arSession.js";
import { PoseFilter } from "../dist/poseFilter.js";
import { ViroTrackingState } from "../dist/sceneApi.js";

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

function fakeSession(opts = {}) {
  const calls = { poses: [], statuses: [], visibility: [], sourceUploads: 0, rgbaUploads: 0 };
  const sceneApi = new Proxy(
    {
      arSetPose: (...a) => calls.poses.push({ q: a.slice(0, 4), p: a.slice(4, 7), state: a[7] }),
      getRootNode: () => 1,
      setNodeVisible: (node, visible) => calls.visibility.push(visible),
      updateTextureFromSource: () => { calls.sourceUploads++; return true; },
      createTextureRGBA: () => { calls.rgbaUploads++; return 7; },
    },
    { get: (t, k) => t[k] ?? (() => 0) },
  );
  const s = new ViroArSession({
    sceneApi,
    loadSlam: () => {},
    onStatus: (state, quality, detail) => calls.statuses.push({ state, detail }),
    ...opts,
  });
  // What start() would have set up, minus the camera.
  s.video = { readyState: 4, HAVE_CURRENT_DATA: 2 };
  s.canvas = { width: 4, height: 4 };
  s.ctx = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) };
  s.module = { HEAPU8: new Uint8Array(4096) };
  const frame = { status: SlamStatus.Running, confidence: PoseConfidence.Full, yaw: 0 };
  s.engine = {
    allocFrameBuffer: () => 0,
    processFrame: () => 0,
    getStatus: () => frame.status,
    poseConfidence: () => frame.confidence,
    trackingReason: () => 0,
    trackingQuality: () => 1,
    poseQx: () => 0, poseQy: () => 0,
    poseQz: () => Math.sin(frame.yaw / 2), poseQw: () => Math.cos(frame.yaw / 2),
    posePx: () => 0, posePy: () => 0, posePz: () => 0,
  };
  s.poseFilter = opts.poseSmoothing === false ? null : new PoseFilter(opts.poseSmoothing ?? {});
  const step = (status, confidence) => {
    frame.status = status;
    frame.confidence = confidence;
    s.processFrame();
  };
  return { s, calls, step, frame };
}

ok("graded confidence picks the renderer's state", () => {
  const { calls, step } = fakeSession({ poseSmoothing: false });
  step(SlamStatus.Running, PoseConfidence.Full);
  step(SlamStatus.Running, PoseConfidence.PositionNoScale);
  step(SlamStatus.Lost, PoseConfidence.RotationOnly);
  step(SlamStatus.Lost, PoseConfidence.None);
  step(SlamStatus.Initializing, PoseConfidence.None);
  assert.deepEqual(calls.poses.map((p) => p.state), [
    ViroTrackingState.Normal,
    ViroTrackingState.Normal,
    ViroTrackingState.Limited,
    ViroTrackingState.Unavailable,
    ViroTrackingState.Unavailable,
  ]);
});

ok("an engine that cannot grade is drawn only when Running", () => {
  const { s, calls, step } = fakeSession({ poseSmoothing: false });
  delete s.engine.poseConfidence;
  step(SlamStatus.Running, 0);
  step(SlamStatus.Initializing, 0);
  step(SlamStatus.Lost, 0);
  assert.deepEqual(calls.poses.map((p) => p.state), [
    ViroTrackingState.Normal,
    ViroTrackingState.Unavailable,
    ViroTrackingState.Unavailable,
  ]);
});

ok("renderWhileLimited still forces Normal", () => {
  const { calls, step } = fakeSession({ poseSmoothing: false, renderWhileLimited: true });
  step(SlamStatus.Initializing, PoseConfidence.None);
  assert.equal(calls.poses[0].state, ViroTrackingState.Normal);
});

ok("the reported state rides out a short dropout and comes back at once", () => {
  const { calls, step } = fakeSession({ poseSmoothing: false });
  step(SlamStatus.Running, PoseConfidence.Full);
  for (let i = 0; i < 5; i++) step(SlamStatus.Lost, PoseConfidence.RotationOnly);
  step(SlamStatus.Running, PoseConfidence.Full);
  assert.ok(calls.statuses.every((c) => c.state === ViroTrackingState.Normal));
  // The frame's own detail is not debounced.
  assert.equal(calls.statuses[1].detail.confidence, PoseConfidence.RotationOnly);
  for (let i = 0; i < 20; i++) step(SlamStatus.Lost, PoseConfidence.RotationOnly);
  assert.equal(calls.statuses.at(-1).state, ViroTrackingState.Unavailable);
  step(SlamStatus.Running, PoseConfidence.Full);
  assert.equal(calls.statuses.at(-1).state, ViroTrackingState.Normal);
});

ok("the feed is drawn from the source texture when there is one", () => {
  const withSource = fakeSession({ poseSmoothing: false });
  withSource.s.bgTexture = 5;
  withSource.s.bgFromSource = true;
  withSource.step(SlamStatus.Running, PoseConfidence.Full);
  assert.equal(withSource.calls.sourceUploads, 1);
  assert.equal(withSource.calls.rgbaUploads, 0);
  const without = fakeSession({ poseSmoothing: false });
  without.step(SlamStatus.Running, PoseConfidence.Full);
  assert.equal(without.calls.sourceUploads, 0);
  assert.equal(without.calls.rgbaUploads, 1);
});

ok("PoseFilter smooths jitter at rest", () => {
  const f = new PoseFilter();
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.01;
  let rawVar = 0;
  let outVar = 0;
  for (let i = 0; i < 300; i++) {
    const p = [noise(), noise(), noise()];
    const out = f.apply(i / 60, p, [0, 0, 0, 1]).position;
    if (i > 30) {
      rawVar += p[0] ** 2;
      outVar += out[0] ** 2;
    }
  }
  assert.ok(outVar < rawVar * 0.3, `filtered variance ${outVar} vs raw ${rawVar}`);
});

ok("PoseFilter follows steady motion closely", () => {
  const f = new PoseFilter();
  let out;
  for (let i = 0; i <= 120; i++) out = f.apply(i / 60, [i / 60, 0, 0], [0, 0, 0, 1]).position;
  // 1 m/s for two seconds: lag well under 10 cm.
  assert.ok(2 - out[0] < 0.1, `lag ${2 - out[0]} m`);
});

ok("PoseFilter starts over after a gap and rotates the short way", () => {
  const f = new PoseFilter();
  f.apply(0, [0, 0, 0], [0, 0, 0, 1]);
  const after = f.apply(2, [5, 0, 0], [0, 0, 0, 1]).position;
  assert.deepEqual(after, [5, 0, 0]);
  const g = new PoseFilter();
  g.apply(0, [0, 0, 0], [0, 0, 0, 1]);
  // -q is the same rotation as q: the output must stay near identity.
  const r = g.apply(1 / 60, [0, 0, 0], [0, 0, 0, -1]).rotation;
  assert.ok(Math.abs(Math.abs(r[3]) - 1) < 1e-9, `w ${r[3]}`);
});

ok("content hides after a held stretch and comes back with the pose", () => {
  const { calls, step } = fakeSession({ poseSmoothing: false });
  step(SlamStatus.Running, PoseConfidence.Full);
  for (let i = 0; i < 14; i++) step(SlamStatus.Lost, PoseConfidence.None);
  assert.deepEqual(calls.visibility, [], "a short dropout keeps the content");
  step(SlamStatus.Lost, PoseConfidence.None);
  step(SlamStatus.Lost, PoseConfidence.None);
  assert.deepEqual(calls.visibility, [false], "hidden once, not every frame");
  step(SlamStatus.Lost, PoseConfidence.RotationOnly);
  assert.deepEqual(calls.visibility, [false, true], "a drawn pose shows it again");
});

ok("hideContentWhenLost: false leaves visibility alone", () => {
  const { calls, step } = fakeSession({ poseSmoothing: false, hideContentWhenLost: false });
  for (let i = 0; i < 40; i++) step(SlamStatus.Lost, PoseConfidence.None);
  assert.deepEqual(calls.visibility, []);
});

ok("stop() shows content it hid", () => {
  const { s, calls, step } = fakeSession({ poseSmoothing: false });
  for (let i = 0; i < 20; i++) step(SlamStatus.Lost, PoseConfidence.None);
  // The fake has no camera or textures to release.
  s.video = null;
  s.engine = null;
  s.stop();
  assert.deepEqual(calls.visibility, [false, true]);
});

// tinyvio's cameraFromDeviceForOrientation(angle), written out as matrices.
function quatToM3([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
function tinyvioCameraFromDevice(deg) {
  const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // rot * diag(1, -1, -1)
  return [[c, s, 0], [s, -c, 0], [0, 0, -1]];
}

ok("camera-from-device matches tinyvio for every screen angle", () => {
  for (const angle of [0, 90, 180, 270, -90]) {
    const got = quatToM3(cameraFromDeviceQuat(angle));
    const want = tinyvioCameraFromDevice(angle);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assert.ok(Math.abs(got[r][c] - want[r][c]) < 1e-9, `angle ${angle} [${r}][${c}] ${got[r][c]} vs ${want[r][c]}`);
      }
    }
  }
  // Portrait, rear camera: camera X = device X, camera Y = device -Y (image
  // rows grow down the screen), camera Z = device -Z (looking out the back).
  const portrait = quatToM3(cameraFromDeviceQuat(0)).map((row) => row.map((v) => Math.round(v) + 0));
  assert.deepEqual(portrait, [[1, 0, 0], [0, -1, 0], [0, 0, -1]]);
});

ok("rotationRate is read per engine: WebKit in sensor order, others per spec", () => {
  const r = { alpha: 1, beta: 2, gamma: 3 };
  // WebKit fills alpha/beta/gamma with the X/Y/Z rates.
  assert.deepEqual(deviceGyro(r, true), [1, 2, 3]);
  // The spec: beta about X, gamma about Y, alpha about Z.
  assert.deepEqual(deviceGyro(r, false), [2, 3, 1]);
  assert.deepEqual(deviceGyro({ alpha: null, beta: null, gamma: null }, true), [0, 0, 0]);
});

console.log(`session: all ${passed} checks passed`);

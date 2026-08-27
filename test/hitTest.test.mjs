/**
 * hitTest unprojects through the same frustum the renderer projects with.
 *
 * The check is a round trip rather than a hand-computed expectation: take a
 * point on a plane, project it to a pixel with the formula VROARCameraWeb
 * builds its frustum from (VROARWeb.cpp::getProjection), ask hitTest what is
 * under that pixel, and require the answer back. A ray built from any other
 * frustum fails this, which is what the fixed 60-degree assumption was doing.
 */
import assert from "node:assert/strict";
import { ViroArSession } from "../dist/arSession.js";

const sceneApiStub = new Proxy({}, { get: () => () => 0 });

function session(intr, width, height) {
  const s = new ViroArSession({ sceneApi: sceneApiStub, loadSlam: () => {} });
  s.appliedIntrinsics = intr ? { intr, width, height } : null;
  return s;
}

/** The frustum half-extents, as getProjection computes them. */
function frustum(intr, W, H, vpW, vpH) {
  const aspect = vpH > 0 ? vpW / vpH : 1;
  let l, r, t, b;
  if (intr) {
    l = intr.cx / intr.fx;
    r = (W - intr.cx) / intr.fx;
    t = intr.cy / intr.fy;
    b = (H - intr.cy) / intr.fy;
  } else {
    t = b = Math.tan((30 * Math.PI) / 180);
    l = r = t * aspect;
  }
  const imageAspect = (r + l) / (t + b);
  if (aspect > imageAspect) {
    const total = (t + b) * aspect, lr = l + r;
    l = total * (l / lr); r = total * (r / lr);
  } else {
    const total = (l + r) / aspect, tb = t + b;
    t = total * (t / tb); b = total * (b / tb);
  }
  return { l, r, t, b };
}

/** Camera-space point (camera at origin, identity rotation) to a pixel. */
function project(p, f, vpW, vpH) {
  const depth = -p[2];
  assert.ok(depth > 0, "point must be in front of the camera");
  const u = (p[0] / depth + f.l) / (f.l + f.r);
  const v = (f.t - p[1] / depth) / (f.t + f.b);
  return [u * vpW, v * vpH];
}

function roundTrip(name, intr, imgW, imgH, vpW, vpH) {
  const s = session(intr, imgW, imgH);
  const planeY = -1.5;
  s.lastPlanes = [{
    id: "floor", center: [0, planeY, 0], normal: [0, 1, 0], rotation: [0, 0, 0],
    width: 100, height: 100, alignment: "HorizontalUpward", confidence: 1,
  }];
  const f = frustum(intr, imgW, imgH, vpW, vpH);

  // Centre, an off-axis corner, and a point far out where the error the old
  // code made was largest.
  for (const target of [[0, planeY, -3], [1.1, planeY, -2.2], [-0.9, planeY, -1.4]]) {
    const [x, y] = project(target, f, vpW, vpH);
    const hits = s.hitTest(x, y, vpW, vpH);
    assert.equal(hits.length, 1, `${name}: expected one hit at ${x},${y}`);
    for (let i = 0; i < 3; i++) {
      assert.ok(
        Math.abs(hits[0].position[i] - target[i]) < 1e-6,
        `${name}: axis ${i} came back ${hits[0].position[i]}, wanted ${target[i]}`,
      );
    }
  }
  console.log(`  ok  ${name}`);
}

// The measured default: f = 0.707 * long axis on a 640x480 capture, which is a
// 55.6-degree camera, not the 60 the old ray assumed.
roundTrip("measured 640x480 default, 4:3 viewport",
  { fx: 452.5, fy: 452.5, cx: 320, cy: 240 }, 640, 480, 800, 600);

// A principal point off centre, which the old ray ignored entirely.
roundTrip("off-centre principal point, 16:9 viewport",
  { fx: 1357.41, fy: 1357.41, cx: 940, cy: 700 }, 1920, 1440, 1600, 900);

// Portrait viewport over a landscape image: exercises the widening branch.
roundTrip("portrait viewport, landscape image",
  { fx: 452.5, fy: 452.5, cx: 320, cy: 240 }, 640, 480, 540, 960);

// No intrinsics: both sides fall back to 60 degrees and must still agree.
roundTrip("no intrinsics, 60-degree fallback", null, 0, 0, 800, 600);

// The bug this replaced: with a real camera, the old fixed-60 ray missed.
//
// Worth stating where it missed, because it explains how this survived being
// tried by hand. Scaling a ray's x and y by the same factor does not move
// where it crosses a horizontal plane laterally -- the factor cancels -- so a
// tap on the floor still put the object under the finger. It lands in depth
// instead: the object is in the right direction and the wrong distance, which
// reads as a scale problem, or as the tracker being off, or as nothing at all
// until something has to sit next to something else.
{
  const intr = { fx: 452.5, fy: 452.5, cx: 320, cy: 240 };
  const [vpW, vpH] = [800, 600];
  const s = session(intr, 640, 480);
  s.lastPlanes = [{
    id: "floor", center: [0, -1.5, 0], normal: [0, 1, 0], rotation: [0, 0, 0],
    width: 100, height: 100, alignment: "HorizontalUpward", confidence: 1,
  }];
  const target = [1.1, -1.5, -2.2];
  const [x, y] = project(target, frustum(intr, 640, 480, vpW, vpH), vpW, vpH);

  // What the old implementation would have produced for the same pixel.
  const tanV = Math.tan((30 * Math.PI) / 180), tanH = tanV * (vpW / vpH);
  const dir = [((x / vpW) * 2 - 1) * tanH, (1 - (y / vpH) * 2) * tanV, -1];
  const tHit = -1.5 / dir[1];
  const old = [dir[0] * tHit, -1.5, dir[2] * tHit];

  const err = Math.hypot(old[0] - target[0], old[1] - target[1], old[2] - target[2]);
  assert.ok(err > 0.1, `the fixed-60 ray should visibly miss; it was off by ${err}`);
  assert.ok(
    Math.abs(old[0] - target[0]) < 1e-6,
    "lateral error should cancel on a horizontal plane -- if it does not, the " +
      "comment above is wrong and this test is measuring something else",
  );
  const hits = s.hitTest(x, y, vpW, vpH);
  assert.ok(
    Math.hypot(...hits[0].position.map((c, i) => c - target[i])) < 1e-6,
    "and the fixed version should land on the point",
  );
  console.log(
    `  ok  regression: fixed-60 ray was ${err.toFixed(3)} m out, ` +
      `all of it in depth (${(old[2] - target[2]).toFixed(3)} m)`,
  );
}

console.log("hitTest: all checks passed");

// --- Live intrinsics scale onto the delivered capture -----------------------
// A calibration is done at the sensor's full resolution; getUserMedia hands over
// something smaller. Taking the measured numbers as-is makes the focal too long
// by the ratio, which misplaces content and reads as a tracking fault.
{
  const s = new ViroArSession({
    sceneApi: sceneApiStub,
    loadSlam: () => {},
    intrinsics: { fx: 1357.41, fy: 1357.41, cx: 960, cy: 720 },
    intrinsicsSize: { width: 1920, height: 1440 },
  });
  const got = s.resolveIntrinsics(640, 480);
  const k = 640 / 1920;
  for (const [field, want] of [["fx", 1357.41 * k], ["fy", 1357.41 * k],
                               ["cx", 960 * k], ["cy", 720 * k]]) {
    assert.ok(
      Math.abs(got[field] - want) < 1e-9,
      `${field} came back ${got[field]}, wanted ${want}`,
    );
  }
  // Without intrinsicsSize the numbers describe the delivered frame already.
  const s2 = new ViroArSession({
    sceneApi: sceneApiStub,
    loadSlam: () => {},
    intrinsics: { fx: 452.5, fy: 452.5, cx: 320, cy: 240 },
  });
  assert.equal(s2.resolveIntrinsics(640, 480).fx, 452.5);
  console.log("  ok  live intrinsics scale onto the capture (and pass through without a size)");
}

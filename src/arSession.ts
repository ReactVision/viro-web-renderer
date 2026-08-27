/**
 * Web AR orchestration for the Viro renderer.
 *
 * The renderer (virocore/WASM) does not track — it just draws the scene from a
 * pose. Tracking runs in a *second* WASM module, tinyvio, driven here in JS: we
 * capture the camera + IMU, feed them to the tracker, read back the 6-DoF pose,
 * convert it from the tracker's Z-up/OpenCV convention into virocore's Y-up/GL
 * convention, and inject it via the AR C API (ViroSceneApi.arSet*).
 *
 * Everything in this file named `Slam*` is named after a C API, not after the
 * engine behind it. tinyvio replaced an earlier tracker and deliberately kept
 * that API — a `SlamModule` factory yielding a `SlamEngine` — so this file, the
 * bridge, and anything written against either keep working untouched. The names
 * are the contract; tinyvio is the implementation.
 *
 * This module is framework-agnostic (pure DOM); ViroARSceneNavigator wires it
 * into React and handles the permission UX.
 */

import type { ViroSceneApi } from "./sceneApi.js";
import { ViroTrackingState } from "./sceneApi.js";

/**
 * The raw tracking engine (embind class "SlamEngine"; see tinyvio's
 * platforms/slam/slam_web_bindings.cpp). Only the members we drive are typed.
 *
 * tinyvio binds three members beyond these — poseConfidence, trackingReason and
 * groundIsEstimated — that this session does not yet surface. They are not new
 * estimation; they are states the engine was already in and had no way to say
 * out loud. See the note on `onStatus` for what that currently costs.
 */
export interface SlamEngine {
  configure(
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    width: number,
    height: number,
    k1: number,
    k2: number,
    p1: number,
    p2: number,
    fastThreshold: number,
    gyroNoise: number,
    accelNoise: number,
    gyroBiasNoise: number,
    accelBiasNoise: number,
    lostThreshold: number,
    lostRecovery: number,
    lostGrace: number,
    qImuCamX: number,
    qImuCamY: number,
    qImuCamZ: number,
    qImuCamW: number,
  ): void;
  start(): void;
  stop(): void;
  feedImu(ts: number, ax: number, ay: number, az: number, gx: number, gy: number, gz: number): void;
  allocFrameBuffer(size: number): number;
  processFrame(width: number, height: number, stride: number, timestamp: number): number;
  poseQx(): number;
  poseQy(): number;
  poseQz(): number;
  poseQw(): number;
  posePx(): number;
  posePy(): number;
  posePz(): number;
  trackingQuality(): number;
  getStatus(): number;
  // Planes (fetch then read by index; all in the tracker's Z-up world space).
  fetchPlanes(maxPlanes: number): number;
  planeId(i: number): number;
  planeCenterX(i: number): number;
  planeCenterY(i: number): number;
  planeCenterZ(i: number): number;
  planeNormalX(i: number): number;
  planeNormalY(i: number): number;
  planeNormalZ(i: number): number;
  planeExtentX(i: number): number;
  planeExtentZ(i: number): number;
  planeType(i: number): number;
  planeConfidence(i: number): number;
  delete(): void;
}

/**
 * The Emscripten module the factory yields.
 *
 * tinyvio's `tinyvio-slam.js` is built with MODULARIZE but deliberately without
 * EXPORT_ES6: it is loaded as a classic <script> that leaves a `SlamModule`
 * global behind, which is what ViroARSceneNavigator.web's `slamScriptUrl` does.
 * There is no ES-module build, so `loadSlam` is where you adapt whatever you
 * have into a factory.
 */
export interface SlamWasmModule {
  SlamEngine: new () => SlamEngine;
  /** Live view of WASM heap; re-read each frame (it detaches on memory growth). */
  HEAPU8: Uint8Array;
  [key: string]: unknown;
}

export type SlamWasmFactory = (moduleArg?: Record<string, unknown>) => Promise<SlamWasmModule>;

/** slam_get_status() values (SlamCStatus in slam_c_api.h). */
export enum SlamStatus {
  Uninitialized = 0,
  Initializing = 1,
  Running = 2,
  Lost = 3,
}

/** Plane classification (SlamPlaneType in tinyvio's platforms/slam/slam_c_api.h). */
export enum SlamPlaneType {
  HorizontalUpward = 0,
  HorizontalDownward = 1,
  Vertical = 2,
}

/** Viro plane alignment, matching ViroARPlaneAlignment in the bridge. */
export type ArPlaneAlignment =
  | "Horizontal"
  | "HorizontalUpward"
  | "HorizontalDownward"
  | "Vertical";

/**
 * A detected plane, converted from the tracker (Z-up) to virocore (Y-up) world space.
 * `rotation` (Euler degrees) orients local +Y to the plane normal, so children
 * placed in the local XZ plane lie on the surface. width/height are the extents
 * along the plane's local X/Z.
 *
 * That rectangle is an approximation of what tinyvio actually found. It detects
 * a boundary polygon and the C API this comes through has only a centre and two
 * extents, so the polygon is reduced to its bounding box on the way here. The
 * box is never smaller than the surface and on a room-sized floor it can be
 * noticeably larger — fine for placing an object on, misleading if you draw it.
 */
export interface ArPlaneAnchor {
  id: string;
  center: [number, number, number];
  normal: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  alignment: ArPlaneAlignment;
  confidence: number;
}

/** A ray/plane hit, in virocore (Y-up) world space. */
export interface ArHitResult {
  anchorId: string;
  position: [number, number, number];
  normal: [number, number, number];
  distance: number;
}

/**
 * Pinhole intrinsics; if omitted they are derived from the capture resolution.
 *
 * `k1`/`k2`/`p1`/`p2` are part of the C API and are accepted, but tinyvio has
 * no distortion model and ignores them. Fine for a phone's normal rear camera,
 * wrong for an ultrawide — and said here rather than left to be discovered.
 */
export interface SlamIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  /** Accepted and unused: tinyvio has no distortion model. */
  k1?: number;
  /** Accepted and unused: tinyvio has no distortion model. */
  k2?: number;
  /** Accepted and unused: tinyvio has no distortion model. */
  p1?: number;
  /** Accepted and unused: tinyvio has no distortion model. */
  p2?: number;
}

/**
 * Tracker tuning knobs, as the C API defines them.
 *
 * Five of the eight reach nothing. tinyvio is keyframe-and-bundle-adjustment,
 * not a filter, so the IMU noise densities have no counterpart and its
 * `slam_configure` accepts and ignores them; `lostRecovery` it does not read at
 * all. They stay in the type because the C API has the fields and a caller with
 * an older engine may still be setting them, but changing them here does
 * nothing, and a knob that silently does nothing is worse than one that is not
 * offered — hence the per-field notes.
 *
 * `fastThreshold`, `lostThreshold` and `lostGrace` do take effect.
 */
export interface SlamTuning {
  /** FAST corner threshold. Lower finds more corners, and noisier ones. */
  fastThreshold: number;
  /** Ignored by tinyvio: no filter, so no noise density. */
  gyroNoise: number;
  /** Ignored by tinyvio: no filter, so no noise density. */
  accelNoise: number;
  /** Ignored by tinyvio: no filter, so no bias random walk. */
  gyroBiasNoise: number;
  /** Ignored by tinyvio: no filter, so no bias random walk. */
  accelBiasNoise: number;
  /** Minimum tracked features to hold a pose. */
  lostThreshold: number;
  /** Ignored by tinyvio: recovery is not gated on a feature count. */
  lostRecovery: number;
  /** Consecutive failed frames tolerated before tracking is declared lost. */
  lostGrace: number;
}

const DEFAULT_TUNING: SlamTuning = {
  fastThreshold: 15,
  gyroNoise: 5e-3,
  accelNoise: 5e-2,
  gyroBiasNoise: 5e-4,
  accelBiasNoise: 1e-2,
  lostThreshold: 8,
  lostRecovery: 15,
  lostGrace: 5,
};

export interface ViroArSessionOptions {
  /** The renderer scene API to inject poses into. */
  sceneApi: ViroSceneApi;
  /**
   * Loads the tracking engine's module factory. Kept pluggable so this package
   * does not hard-depend on how the engine is packaged or served.
   *
   * The engine is tinyvio's `tinyvio-slam.js`, built by its
   * `scripts/build_slam_wasm.sh` (260 KB of WASM plus 41 KB of glue). It is not
   * on npm; host the two files yourself. Because it is a classic script rather
   * than an ES module, the usual form is:
   *
   *   loadSlam: () => globalThis.SlamModule   // after loading tinyvio-slam.js
   *
   * `ViroARSceneNavigator.web` does the script injection for you — pass it
   * `slamScriptUrl` and it builds this callback.
   */
  loadSlam: () =>
    | Promise<SlamWasmFactory | { default: SlamWasmFactory }>
    | SlamWasmFactory
    | { default: SlamWasmFactory };
  /** Requested capture size (device may pick the nearest supported). Default 640x480. */
  captureWidth?: number;
  captureHeight?: number;
  /** Camera facing; default "environment" (rear camera). */
  facingMode?: "environment" | "user";
  /**
   * Measured camera intrinsics, instead of the resolution-derived guess.
   *
   * Supply these when you have them: the frustum, the tracking and the hit test
   * are all built on this one camera, and the fallback is an assumption whose
   * best-fitting value varied by a factor of 1.6 across three recordings from a
   * single phone.
   */
  intrinsics?: SlamIntrinsics;
  /**
   * The resolution `intrinsics` were measured at, when it is not the size the
   * camera actually delivers.
   *
   * Focal length in pixels scales with the image, and a calibration is normally
   * done at the sensor's full resolution while `getUserMedia` hands over
   * something far smaller — 1920x1440 measured against a 640x480 capture is a
   * focal three times too long. Left unstated, the intrinsics are taken to
   * describe the delivered frame as-is, which is right only when the two match.
   */
  intrinsicsSize?: { width: number; height: number };
  /** Override SLAM tuning. */
  tuning?: Partial<SlamTuning>;
  /** Draw the live camera feed behind the scene. Default true. */
  showCameraBackground?: boolean;
  /** Detect planes and surface them via onAnchorsUpdated. Default false. */
  detectPlanes?: boolean;
  /**
   * Render the scene even while tracking is Limited/Unavailable (forces Normal
   * into the renderer). For desktop dev/preview where there's no IMU, so the
   * tracker never converges. Real tracking state is still reported via onStatus.
   */
  renderWhileLimited?: boolean;
  /** Max planes to fetch per update when detectPlanes is on. Default 10. */
  maxPlanes?: number;
  /**
   * Reported each frame with the tracking state and quality [0,1].
   *
   * The state is the engine's coarse status mapped onto virocore's three
   * values, and it is coarser than what tinyvio knows. A `Normal` can be a pose
   * that is six-degree-of-freedom but not yet metric: content placed by
   * `hitTest` is right, content placed at "1.5 metres" is not. tinyvio exposes
   * that distinction as `poseConfidence`, and whether a reported ground plane
   * was detected or assumed as `groundIsEstimated`; neither is surfaced here
   * yet. Until they are, treat `Normal` as "drawing is reasonable", not as "the
   * world is measured".
   */
  onStatus?: (state: ViroTrackingState, quality: number) => void;
  /** Called when the set of detected planes changes (added/removed/moved). */
  onAnchorsUpdated?: (anchors: ArPlaneAnchor[]) => void;
  /** Called once if starting fails (permissions, no camera, engine load error). */
  onError?: (error: Error) => void;
  /**
   * Replay a recorded session instead of tracking a live one.
   *
   * When set, the camera and the tracking engine are both bypassed: frames come
   * from the supplied video and poses from the supplied array, stepped one at a
   * time by the caller rather than by requestAnimationFrame. Everything
   * downstream is unchanged -- the same arSetPose and the same camera-background
   * upload the live path uses -- so a scene composited this way is composited
   * exactly as it would be on a device.
   *
   * The poses are computed offline (tinyvio's replay tool over the recording's
   * video and IMU) rather than re-tracked here. That keeps this deterministic
   * and quick, and keeps two questions apart: whether tracking held is answered
   * by the analysis that produced these poses, and this only answers what the
   * scene looks like on top of it.
   */
  playback?: ArPlaybackSource;
}

/** One replayed frame: when it was taken, and where the camera was. */
export interface ArPlaybackFrame {
  /** Seconds from the start of the recording. */
  t: number;
  /** Camera orientation, virocore (Y-up/GL) space, [x, y, z, w]. */
  q: readonly [number, number, number, number];
  /** Camera position, virocore (Y-up/GL) space. */
  p: readonly [number, number, number];
  /** False on frames the tracker did not hold; the scene is hidden on those. */
  tracked?: boolean;
}

export interface ArPlaybackSource {
  /** The recording, as anything an HTMLVideoElement can play. */
  videoUrl: string;
  /** One entry per frame, in order. */
  frames: ArPlaybackFrame[];
  /** Optional plane anchors per frame, already in virocore space. */
  planes?: ArPlaneAnchor[][];
  /**
   * The recording camera's intrinsics. Supply them: the poses were solved with
   * this camera, and rendering them through a different one puts the content in
   * the wrong place — see ViroArSession.applyIntrinsics.
   */
  intrinsics?: SlamIntrinsics;
  /**
   * The resolution `intrinsics` were measured at, when it is not the video's
   * own. Focal length in pixels scales with the image, so intrinsics from a
   * 1920-wide capture describe a 640-wide decode only after scaling.
   */
  intrinsicsSize?: { width: number; height: number };
  /**
   * The video's display rotation in degrees, from its container metadata.
   *
   * Needed because `intrinsics` describe the sensor-native frame while the
   * `<video>` element presents the rotated one: a phone recording is commonly a
   * 3840x2160 stream tagged -90 that every player shows as 2160x3840. Left
   * unstated, the scale factors in startPlayback get computed across the two
   * orientations -- a portrait canvas divided by a landscape intrinsics size --
   * so fx and fy come out wrong by different amounts and in opposite
   * directions. The camera then has the wrong field of view and content does
   * not hold still against the footage, which reads as a tracking fault.
   */
  intrinsicsRotation?: number;
}

// --- Axis conversion (tracker Z-up/OpenCV → virocore Y-up/GL), ported from the
// tracker's own demo host (tinyvio web/index.html). Quaternions are [x, y, z, w].
//   frameChange = Rx(-90°): world Z-up → world Y-up
//   cameraFlip  = Rx(180°): OpenCV camera (Y-down, Z-fwd) → GL camera (Y-up, Z-back)
//   position'    = frameChange · position
//   orientation' = frameChange · slamQuat · cameraFlip
const FRAME_Q: readonly [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const CAM_FLIP: readonly [number, number, number, number] = [1, 0, 0, 0];

type Quat = readonly [number, number, number, number];

function quatMul(a: Quat, b: Quat): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatRotateVec(q: Quat, v: readonly [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v); v' = v + qw*t + cross(q.xyz, t)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

type Vec3 = [number, number, number];

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v: readonly [number, number, number]): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Quaternion [x,y,z,w] rotating unit vector `a` onto unit vector `b`. */
function quatFromUnitVectors(a: Vec3, b: Vec3): [number, number, number, number] {
  const d = dot(a, b);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    // Antiparallel: rotate 180° about any axis perpendicular to a.
    let axis = cross([1, 0, 0], a);
    if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-6) axis = cross([0, 0, 1], a);
    const [x, y, z] = normalize(axis);
    return [x, y, z, 0];
  }
  const c = cross(a, b);
  const q: [number, number, number, number] = [c[0], c[1], c[2], 1 + d];
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** Quaternion [x,y,z,w] → Euler degrees (XYZ order, matching VRONode). */
function quatToEulerDeg(q: readonly [number, number, number, number]): Vec3 {
  const [x, y, z, w] = q;
  const rad = 180 / Math.PI;
  // XYZ intrinsic.
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll * rad, pitch * rad, yaw * rad];
}

function slamPlaneAlignment(type: number): ArPlaneAlignment {
  switch (type) {
    case SlamPlaneType.HorizontalDownward:
      return "HorizontalDownward";
    case SlamPlaneType.Vertical:
      return "Vertical";
    default:
      return "HorizontalUpward";
  }
}

function slamStatusToTrackingState(status: number): ViroTrackingState {
  switch (status) {
    case SlamStatus.Running:
      return ViroTrackingState.Normal;
    case SlamStatus.Initializing:
      return ViroTrackingState.Limited;
    default:
      return ViroTrackingState.Unavailable;
  }
}

/**
 * Runs the camera + IMU capture loop and injects poses into the renderer.
 * Create one, call start(), and stop() when done.
 */
/**
 * Quarter turns, clockwise, that a player applies to reach the displayed image.
 *
 * ffmpeg reports `rotation=-90` for the common portrait phone capture, and the
 * displayed frame is the sensor frame turned 90 degrees *clockwise* — verified
 * by decoding one frame both ways and correlating. The sign is the opposite of
 * what the metadata reads like, which is worth stating because guessing it
 * wrong is silent: the content still renders, just never where the footage is.
 */
/** Hamilton product, a then b, both (x, y, z, w). */
function quatMulLocal(
  a: readonly number[], b: readonly [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number];
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quarterTurnsCW(rotationDeg: number): number {
  return (((Math.round(-rotationDeg / 90) % 4) + 4) % 4);
}

/**
 * Intrinsics as they apply to the displayed image.
 *
 * A quarter turn swaps the focal axes and moves the principal point. This is
 * only half the correction: turning the image also means the displayed x axis
 * no longer runs along the camera's x, so the camera has to be rolled to match
 * (see rollForDisplay). Intrinsics alone cannot express an axis swap, and
 * applying them without the roll leaves content that renders but does not sit
 * on the footage.
 */
function rotateIntrinsics(
  i: SlamIntrinsics,
  size: { width: number; height: number },
  rotationDeg: number,
): { intrinsics: SlamIntrinsics; size: { width: number; height: number } } {
  const q = quarterTurnsCW(rotationDeg);
  const { width: W, height: H } = size;
  if (q === 0) return { intrinsics: i, size };
  if (q === 2) return { intrinsics: { ...i, cx: W - 1 - i.cx, cy: H - 1 - i.cy }, size };
  const swapped = { fx: i.fy, fy: i.fx };
  return q === 1
    // clockwise: (x, y) -> (H-1-y, x)
    ? { intrinsics: { ...swapped, cx: H - 1 - i.cy, cy: i.cx }, size: { width: H, height: W } }
    // anticlockwise: (x, y) -> (y, W-1-x)
    : { intrinsics: { ...swapped, cx: i.cy, cy: W - 1 - i.cx }, size: { width: H, height: W } };
}

/**
 * The camera roll that goes with that image rotation, as a quaternion to apply
 * on the right of the pose (camera-local).
 *
 * Solved against ground truth rather than reasoned: projecting the tracker's
 * own anchor through every combination of roll and axis swap, only 90 degrees
 * with the swap reproduces the pixel the tracker reports, and it does so to
 * 0.004 px median over 205 frames. Every other combination is off by hundreds.
 */
function rollForDisplay(rotationDeg: number): [number, number, number, number] {
  const a = (quarterTurnsCW(rotationDeg) * Math.PI) / 2;
  return [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
}

export class ViroArSession {
  private readonly opts: ViroArSessionOptions;
  private readonly tuning: SlamTuning;

  private engine: SlamEngine | null = null;
  private module: SlamWasmModule | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private rafId = 0;
  private running = false;
  private imuHandler: ((e: DeviceMotionEvent) => void) | null = null;

  private bgTexture = 0; // current camera-feed texture handle (0 = none)
  private playbackIndex = -1;
  // The camera handed to the renderer, kept so hitTest can unproject through
  // the same frustum the renderer projects with. Null until start().
  private appliedIntrinsics: { intr: SlamIntrinsics; width: number; height: number } | null = null;

  // Latest camera pose in virocore (Y-up) world space, for hit-testing.
  private lastCamPos: Vec3 = [0, 0, 0];
  private lastCamQuat: [number, number, number, number] = [0, 0, 0, 1];
  // Last emitted plane set (by id) for change detection.
  private planeSnapshot = new Map<string, ArPlaneAnchor>();
  private lastPlanes: ArPlaneAnchor[] = [];

  constructor(options: ViroArSessionOptions) {
    this.opts = options;
    this.tuning = { ...DEFAULT_TUNING, ...(options.tuning ?? {}) };
  }

  /**
   * Requests camera/IMU access, boots the tracker, and starts injecting poses.
   * DeviceMotion permission (iOS Safari) must already be granted by the caller
   * from a user gesture; see ViroARSceneNavigator.
   *
   * Rejects if it cannot start, after calling `onError`. Both happen: `onError`
   * is where a UI shows the reason, and the rejection is what stops an `await
   * session.start()` from continuing as though a session existed. This used to
   * resolve either way on the live path — a denied camera then looked, to
   * everything downstream, exactly like a granted one.
   */
  async start(): Promise<void> {
    if (this.opts.playback) {
      await this.startPlayback(this.opts.playback);
      return;
    }
    try {
      const factory = await this.resolveSlamFactory();
      const module = await factory();
      this.module = module;
      this.engine = new module.SlamEngine();

      const width = this.opts.captureWidth ?? 640;
      const height = this.opts.captureHeight ?? 480;

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.opts.facingMode ?? "environment", width, height },
        audio: false,
      });

      const video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.srcObject = this.stream;
      // Safari (and some mobile browsers) won't decode/paint a detached <video>,
      // so drawImage() would yield black frames. Attach it hidden to the DOM.
      video.setAttribute("aria-hidden", "true");
      Object.assign(video.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "1px",
        height: "1px",
        opacity: "0",
        pointerEvents: "none",
        zIndex: "-1",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(video);
      await video.play();
      this.video = video;

      const track = this.stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      const capW = settings.width ?? video.videoWidth ?? width;
      const capH = settings.height ?? video.videoHeight ?? height;

      const intr = this.resolveIntrinsics(capW, capH);
      this.engine.configure(
        intr.fx,
        intr.fy,
        intr.cx,
        intr.cy,
        capW,
        capH,
        intr.k1 ?? 0,
        intr.k2 ?? 0,
        intr.p1 ?? 0,
        intr.p2 ?? 0,
        this.tuning.fastThreshold,
        this.tuning.gyroNoise,
        this.tuning.accelNoise,
        this.tuning.gyroBiasNoise,
        this.tuning.accelBiasNoise,
        this.tuning.lostThreshold,
        this.tuning.lostRecovery,
        this.tuning.lostGrace,
        // camera-to-IMU-frame rotation (x,y,z,w) -- identity for now. TODO:
        // derive from screen.orientation/device orientation once that's wired
        // up; identity only matches raw sensor readings on one orientation.
        0,
        0,
        0,
        1,
      );
      this.engine.start();

      this.canvas = document.createElement("canvas");
      this.canvas.width = capW;
      this.canvas.height = capH;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

      this.opts.sceneApi.initAR();
      // The same intrinsics the tracker is solving with, so the renderer's
      // frustum is the camera the poses were computed in.
      this.applyIntrinsics(intr, capW, capH);

      this.startImu();

      this.running = true;
      this.loop();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.opts.onError?.(error);
      this.stop();
      throw error;
    }
  }

  /** Stops capture, releases the camera, and tears down the tracker. */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.imuHandler) {
      window.removeEventListener("devicemotion", this.imuHandler);
      this.imuHandler = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      // Playback loads through src rather than srcObject; clearing it releases
      // the decoded recording instead of leaving it held by a detached element.
      this.video.removeAttribute("src");
      this.video.load();
      this.video.remove();
      this.video = null;
    }
    if (this.bgTexture) {
      this.opts.sceneApi.destroyTexture(this.bgTexture);
      this.bgTexture = 0;
    }
    if (this.engine) {
      try {
        this.engine.stop();
        this.engine.delete();
      } catch {
        /* engine may already be gone */
      }
      this.engine = null;
    }
    this.module = null;
    this.canvas = null;
    this.ctx = null;
    this.planeSnapshot.clear();
    this.lastPlanes = [];
    this.appliedIntrinsics = null;
  }

  private async resolveSlamFactory(): Promise<SlamWasmFactory> {
    const loaded = await this.opts.loadSlam();
    if (typeof loaded === "function") return loaded;
    if (loaded && typeof loaded.default === "function") return loaded.default;
    throw new Error("loadSlam did not resolve to a tracking-engine factory");
  }

  /**
   * Hand the renderer the camera the poses were solved in.
   *
   * Without intrinsics virocore builds its projection from a fixed 60-degree
   * vertical field of view. The camera image is drawn as a screen-space surface
   * and fills the viewport either way, so a mismatch never shows up in the feed
   * — it shows up as 3-D content standing somewhere other than where it was
   * anchored, by a little near the centre of the frame and by hundreds of
   * pixels toward the edges. A 56-degree camera through a 60-degree frustum is
   * a 7% error in every projected coordinate.
   */
  private applyIntrinsics(intr: SlamIntrinsics, width: number, height: number): void {
    const applied = this.opts.sceneApi.arSetCameraIntrinsics(
      intr.fx, intr.fy, intr.cx, intr.cy, width, height,
    );
    // Only when the renderer took them. On the fallback path it is projecting
    // through its assumed 60 degrees, and hitTest has to assume the same thing
    // or the two disagree in the opposite direction.
    this.appliedIntrinsics = applied ? { intr, width, height } : null;
    if (!applied) {
      this.opts.onError?.(
        new Error(
          "this virocore build has no viroARSetCameraIntrinsics; the scene is " +
            "projected through an assumed 60 degree field of view and will not " +
            "line up with the camera image",
        ),
      );
    }
  }

  private resolveIntrinsics(width: number, height: number): SlamIntrinsics {
    const given = this.opts.intrinsics;
    if (given) {
      // Scale a calibration measured at another resolution onto this capture,
      // the same way the playback path does. Without `intrinsicsSize` the
      // numbers are taken to describe the delivered frame already.
      const from = this.opts.intrinsicsSize;
      if (!from || from.width <= 0 || from.height <= 0) return given;
      const sx = width / from.width;
      const sy = height / from.height;
      return {
        ...given,
        fx: given.fx * sx,
        fy: given.fy * sy,
        cx: given.cx * sx,
        cy: given.cy * sy,
      };
    }

    // No calibration, so this is an assumption — but an aspect-aware one, which
    // the previous `0.9 * width` was not.
    //
    // That form gives the same focal in pixels for a 640x480 frame and a 480x853
    // one, and a single camera cannot have both: getUserMedia crops the sensor to
    // whatever aspect was asked for, and cropping changes the field of view
    // without changing the focal length. What survives a crop is the focal per
    // pixel along the axis the crop *kept*, which for any aspect more elongated
    // than the sensor's is the long axis of the delivered frame.
    //
    // The constant is measured rather than assumed. A SensorRecorder capture from
    // an iPhone rear wide camera reports fx = fy = 1357.41 px on a 1920x1440
    // frame, so f = 0.707 * (long axis). The old value implied a 58 degree
    // horizontal field of view where that camera has 70.6, which made the focal
    // 27% too long on the documented 640x480 default — and a focal that is wrong
    // warps triangulation in a way that shows up as reconstructed camera height
    // drifting, which reads as content floating rather than as a calibration bug.
    //
    // Still only a default. Measured across three recordings from one phone the
    // best-fitting focal varied by a factor of 1.6, which suggests the browser
    // does not always hand over the same crop. Pass `intrinsics` when you know
    // them; this only makes the fallback less wrong.
    const SENSOR_FOCAL_PER_LONG_AXIS_PX = 0.707;
    const f = SENSOR_FOCAL_PER_LONG_AXIS_PX * Math.max(width, height);
    return { fx: f, fy: f, cx: width / 2, cy: height / 2 };
  }

  private startImu(): void {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    const handler = (e: DeviceMotionEvent) => {
      if (!this.engine) return;
      const a = e.accelerationIncludingGravity;
      const r = e.rotationRate;
      if (!a || !r) return;
      const ts = performance.now() / 1000;
      const deg = Math.PI / 180;
      // DeviceMotion's raw rotationRate (alpha=Z, beta=X, gamma=Y) needs a
      // parity flip on gx (not just the direct relabel below) to match the
      // engine's expected handedness -- confirmed against two real captures
      // with independent ground truth (CoreMotion): portrait improved
      // 12.27deg->10.30deg (real: 10.74deg) and landscape 20.88deg->11.76deg
      // (real: 11.80deg) with the SAME unconditional flip. This is NOT an
      // orientation-dependent correction (tried gating it on landscape via
      // both screen.orientation.angle and viewport dimensions; the underlying
      // bug turned out to reproduce in portrait too) -- always apply it.
      const gx = -(r.beta ?? 0) * deg;
      const gy = (r.gamma ?? 0) * deg;
      const gz = (r.alpha ?? 0) * deg;
      this.engine.feedImu(ts, a.x ?? 0, a.y ?? 0, a.z ?? 0, gx, gy, gz);
    };
    window.addEventListener("devicemotion", handler);
    this.imuHandler = handler;
  }

  /**
   * Boot the replay path: a hidden <video> over the recording, a canvas to read
   * it back through, and nothing else. No getUserMedia, no engine, no IMU
   * listener, no rAF -- the caller drives with renderPlaybackFrame().
   */
  private async startPlayback(src: ArPlaybackSource): Promise<void> {
    try {
      const video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.preload = "auto";
      video.src = src.videoUrl;
      video.setAttribute("aria-hidden", "true");
      // Same reason as the live path: a detached <video> paints black in some
      // browsers, so it is attached and hidden rather than kept out of the DOM.
      Object.assign(video.style, {
        position: "fixed", top: "0", left: "0", width: "1px", height: "1px",
        opacity: "0", pointerEvents: "none",
      });
      document.body.appendChild(video);
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error(`could not load ${src.videoUrl}`));
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      this.video = video;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { willReadFrequently: true });

      // The same two calls the live path makes, and for the same reason: the AR
      // subsystem has to be up before a pose lands, and the camera-background
      // pipeline sizes itself from the image dimensions. Without them the
      // background texture is uploaded into a pipeline that is not expecting
      // one, and the scene composites over black — which looks like a video
      // decoding problem and is not.
      this.opts.sceneApi.initAR();
      // Scale to the decoded size: the recording's header reports intrinsics
      // for the capture resolution, which need not be what the <video> hands
      // over.
      // Rotate into the orientation the canvas is actually in before scaling to
      // it. Computing the factors across mismatched orientations made them
      // anisotropic and wrong: on a -90 recording fx came out 44% short and fy
      // 78% long, from intrinsics whose two axes are equal.
      const rotated = src.intrinsics && src.intrinsicsSize
        ? rotateIntrinsics(src.intrinsics, src.intrinsicsSize, src.intrinsicsRotation ?? 0)
        : null;
      const from = rotated?.size ?? src.intrinsicsSize;
      const sx = from && from.width > 0 ? canvas.width / from.width : 1;
      const sy = from && from.height > 0 ? canvas.height / from.height : 1;
      const base = rotated?.intrinsics ?? src.intrinsics;
      const intr: SlamIntrinsics = base
        ? { fx: base.fx * sx, fy: base.fy * sy, cx: base.cx * sx, cy: base.cy * sy }
        : this.resolveIntrinsics(canvas.width, canvas.height);
      this.applyIntrinsics(intr, canvas.width, canvas.height);

      this.running = true;
      this.opts.onStatus?.(ViroTrackingState.Normal, 1);
    } catch (e) {
      this.opts.onError?.(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  /**
   * Seek to one recorded frame, inject its pose, and paint it as the camera
   * background. Resolves once the video has actually decoded that frame, so a
   * caller can screenshot immediately afterwards without racing the decoder.
   *
   * Returns false past the end of the recording.
   */
  async renderPlaybackFrame(index: number): Promise<boolean> {
    const src = this.opts.playback;
    const { video, canvas, ctx } = this;
    if (!src || !video || !canvas || !ctx) return false;
    const frame = src.frames[index];
    if (!frame) return false;

    // Wait for the decoder, but only when there is something to wait for.
    // Assigning currentTime the value it already holds is not guaranteed to
    // produce a `seeked` — a recording with two frames at the same timestamp,
    // or a caller re-rendering the frame it just rendered, would then wait for
    // an event that never arrives and hang the whole replay. An `error` is the
    // other way this never resolves, so it ends the wait too.
    const alreadyThere =
      Math.abs(video.currentTime - frame.t) < 1e-6 &&
      video.readyState >= video.HAVE_CURRENT_DATA;
    if (!alreadyThere) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          video.removeEventListener("error", failed);
          resolve();
        };
        const failed = () => {
          video.removeEventListener("seeked", done);
          video.removeEventListener("error", failed);
          reject(new Error(`playback: decoding failed while seeking to ${frame.t}s`));
        };
        video.addEventListener("seeked", done);
        video.addEventListener("error", failed);
        video.currentTime = frame.t;
      });
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.drawImage(video, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    // A frame the tracker did not hold has no pose worth drawing against.
    // Reporting Limited hides the scene and leaves the camera feed alone, which
    // is what a device does and what an honest preview should show.
    const state = frame.tracked === false
      ? ViroTrackingState.Limited
      : ViroTrackingState.Normal;
    // The pose describes the sensor-native camera; the background is the
    // rotated frame. Roll the camera to match, or content renders in the right
    // world position and the wrong place on screen.
    const roll = rollForDisplay(src.intrinsicsRotation ?? 0);
    const q = quatMulLocal(frame.q, roll);
    this.opts.sceneApi.arSetPose(
      q[0], q[1], q[2], q[3],
      frame.p[0], frame.p[1], frame.p[2], state,
    );
    this.lastCamPos = [frame.p[0], frame.p[1], frame.p[2]];
    this.lastCamQuat = [q[0], q[1], q[2], q[3]];

    const planes = src.planes?.[index];
    if (planes) {
      this.lastPlanes = planes;
      this.opts.onAnchorsUpdated?.(planes);
    }

    if (this.opts.showCameraBackground !== false) {
      this.updateCameraBackground(rgba, w, h);
    }
    this.playbackIndex = index;
    return true;
  }

  /** How many frames the loaded recording has. */
  get playbackFrameCount(): number {
    return this.opts.playback?.frames.length ?? 0;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.processFrame();
  };

  private processFrame(): void {
    const { video, canvas, ctx, engine, module } = this;
    if (!video || !canvas || !ctx || !engine || !module) return;
    if (video.readyState < video.HAVE_CURRENT_DATA) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.drawImage(video, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    // RGBA → grayscale (Rec.601 integer weights), row-major top-left origin.
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const ri = i * 4;
      gray[i] = (rgba[ri] * 77 + rgba[ri + 1] * 150 + rgba[ri + 2] * 29) >> 8;
    }

    const ts = performance.now() / 1000;
    const ptr = engine.allocFrameBuffer(gray.length);
    // Re-read HEAPU8: it detaches when WASM memory grows.
    module.HEAPU8.set(gray, ptr);
    const err = engine.processFrame(w, h, w, ts);
    if (err !== 0) return;

    const status = engine.getStatus();
    const state = slamStatusToTrackingState(status);
    this.opts.onStatus?.(state, engine.trackingQuality());

    // The renderer only draws the scene when tracking is Normal. Without an IMU
    // (desktop) the tracker never leaves Limited, so `renderWhileLimited` forces Normal
    // into the renderer (real state still goes to onStatus) — a dev/preview aid.
    const injectedState =
      this.opts.renderWhileLimited && state !== ViroTrackingState.Normal
        ? ViroTrackingState.Normal
        : state;

    // Convert pose (Z-up/OpenCV) → virocore (Y-up/GL) and inject.
    const slamQuat: Quat = [engine.poseQx(), engine.poseQy(), engine.poseQz(), engine.poseQw()];
    const [px, py, pz] = quatRotateVec(FRAME_Q, [engine.posePx(), engine.posePy(), engine.posePz()]);
    const [qx, qy, qz, qw] = quatMul(quatMul(FRAME_Q, slamQuat), CAM_FLIP);
    this.opts.sceneApi.arSetPose(qx, qy, qz, qw, px, py, pz, injectedState);
    this.lastCamPos = [px, py, pz];
    this.lastCamQuat = [qx, qy, qz, qw];

    if (this.opts.detectPlanes) {
      this.emitPlanes();
    }

    if (this.opts.showCameraBackground !== false) {
      this.updateCameraBackground(rgba, w, h);
    }
  }

  /**
   * Fetch the tracker's planes, convert to virocore (Y-up) space, and fire
   * onAnchorsUpdated when the set changes (added/removed/moved beyond epsilon).
   */
  private emitPlanes(): void {
    const engine = this.engine;
    if (!engine) return;
    const max = this.opts.maxPlanes ?? 10;
    const count = engine.fetchPlanes(max);

    const planes: ArPlaneAnchor[] = [];
    for (let i = 0; i < count; i++) {
      const center = quatRotateVec(FRAME_Q, [
        engine.planeCenterX(i),
        engine.planeCenterY(i),
        engine.planeCenterZ(i),
      ]);
      const normal = normalize(
        quatRotateVec(FRAME_Q, [engine.planeNormalX(i), engine.planeNormalY(i), engine.planeNormalZ(i)]),
      );
      const rotation = quatToEulerDeg(quatFromUnitVectors([0, 1, 0], normal));
      planes.push({
        id: String(engine.planeId(i)),
        center,
        normal,
        rotation,
        width: engine.planeExtentX(i),
        height: engine.planeExtentZ(i),
        alignment: slamPlaneAlignment(engine.planeType(i)),
        confidence: engine.planeConfidence(i),
      });
    }

    if (this.planesChanged(planes)) {
      this.planeSnapshot = new Map(planes.map((p) => [p.id, p]));
      this.lastPlanes = planes;
      this.opts.onAnchorsUpdated?.(planes);
    }
  }

  private planesChanged(planes: ArPlaneAnchor[]): boolean {
    if (planes.length !== this.planeSnapshot.size) return true;
    const eps = 0.02; // 2 cm / 2 cm extent
    for (const p of planes) {
      const prev = this.planeSnapshot.get(p.id);
      if (!prev) return true;
      if (
        Math.abs(p.center[0] - prev.center[0]) > eps ||
        Math.abs(p.center[1] - prev.center[1]) > eps ||
        Math.abs(p.center[2] - prev.center[2]) > eps ||
        Math.abs(p.width - prev.width) > eps ||
        Math.abs(p.height - prev.height) > eps
      ) {
        return true;
      }
    }
    return false;
  }

  /** The most recently emitted plane set. */
  getPlanes(): ArPlaneAnchor[] {
    return this.lastPlanes;
  }

  /**
   * The half-extents of the render frustum at unit depth, as VROARCameraWeb
   * builds them (VROARWeb.cpp::getProjection).
   *
   * This has to track that function rather than assume anything, because the
   * two are the same frustum seen from two sides: the renderer projects world
   * points onto the screen with it, and a hit test unprojects a screen point
   * back out through it. A ray built from a different frustum than the one that
   * drew the frame lands somewhere the user did not tap -- and the error is
   * smallest at the centre, which is exactly where it gets tested by hand and
   * looks fine.
   *
   * Until intrinsics existed both sides assumed a fixed 60-degree vertical
   * field of view and agreed by construction. They no longer do: the renderer
   * uses the real camera whenever ViroArSession has supplied one, which is
   * always. On the 640x480 default that is a 55.6-degree camera, so the old
   * assumption put every ray about 8% wide, plus a constant offset for the
   * principal point it ignored entirely.
   */
  private frustumAt(
    viewportW: number,
    viewportH: number,
  ): { l: number; r: number; t: number; b: number } {
    const aspect = viewportH > 0 ? viewportW / viewportH : 1;
    const i = this.appliedIntrinsics;

    let l: number, r: number, t: number, b: number;
    if (i && i.width > 0 && i.height > 0) {
      l = i.intr.cx / i.intr.fx;
      r = (i.width - i.intr.cx) / i.intr.fx;
      t = i.intr.cy / i.intr.fy;
      b = (i.height - i.intr.cy) / i.intr.fy;
    } else {
      // The same fallback the renderer takes when it has no intrinsics.
      t = b = Math.tan((30 * Math.PI) / 180);
      l = r = t * aspect;
    }

    // The viewport rarely has the image's aspect ratio, so the renderer widens
    // the axis with room to spare instead of stretching. Off-axis too, which is
    // why this splits the total in proportion rather than halving it.
    const imageAspect = (r + l) / (t + b);
    if (aspect > imageAspect) {
      const total = (t + b) * aspect;
      const lr = l + r;
      l = total * (l / lr);
      r = total * (r / lr);
    } else {
      const total = (l + r) / aspect;
      const tb = t + b;
      t = total * (t / tb);
      b = total * (b / tb);
    }
    return { l, r, t, b };
  }

  /**
   * Cast a ray from the camera through a screen point and intersect the detected
   * planes. Returns hits sorted nearest-first (virocore Y-up world space).
   * viewport dims are in the same pixels as screenX/screenY (top-left origin).
   */
  hitTest(screenX: number, screenY: number, viewportW: number, viewportH: number): ArHitResult[] {
    const f = this.frustumAt(viewportW, viewportH);
    // Off-axis, so the mapping is edge-to-edge rather than about a centre that
    // a real camera does not have: u=0 lands on the left half-extent, u=1 on
    // the right. With l==r and t==b this reduces to the symmetric ndc form.
    const u = viewportW > 0 ? screenX / viewportW : 0.5;
    const v = viewportH > 0 ? screenY / viewportH : 0.5;
    const dirCam: Vec3 = [-f.l + u * (f.l + f.r), f.t - v * (f.t + f.b), -1];
    const dir = normalize(quatRotateVec(this.lastCamQuat, dirCam));
    const origin = this.lastCamPos;

    const hits: ArHitResult[] = [];
    for (const p of this.lastPlanes) {
      const denom = dot(dir, p.normal);
      if (Math.abs(denom) < 1e-6) continue;
      const t = dot([p.center[0] - origin[0], p.center[1] - origin[1], p.center[2] - origin[2]], p.normal) / denom;
      if (t <= 0) continue;
      const hit: Vec3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
      hits.push({ anchorId: p.id, position: hit, normal: p.normal, distance: t });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Upload the current camera frame as the scene background texture. GL samples
   * with v=0 at the bottom while getImageData is top-row-first, so flip rows.
   * NOTE: this recreates a texture each frame; a future viroUpdateTexture path
   * would avoid the churn.
   */
  private updateCameraBackground(rgba: Uint8ClampedArray, w: number, h: number): void {
    // Upload rows as-is (top-first), matching ViroImage's orientation — the
    // texture/surface pipeline already samples correctly, so an extra flip here
    // would render the feed upside down.
    const tex = this.opts.sceneApi.createTextureRGBA(new Uint8Array(rgba), w, h, true);
    this.opts.sceneApi.arSetCameraBackground(tex);
    if (this.bgTexture) {
      this.opts.sceneApi.destroyTexture(this.bgTexture);
    }
    this.bgTexture = tex;
  }
}

/**
 * Requests DeviceMotion permission on iOS 13+ Safari, which requires a call
 * from a user gesture. Resolves true if motion events are available.
 */
export async function requestDeviceMotionPermission(): Promise<boolean> {
  const anyMotion = (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent as
    | { requestPermission?: () => Promise<"granted" | "denied"> }
    | undefined;
  if (!anyMotion) return false;
  if (typeof anyMotion.requestPermission === "function") {
    try {
      const result = await anyMotion.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  }
  return true; // non-iOS: no explicit permission needed
}

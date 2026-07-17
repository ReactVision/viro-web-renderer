/**
 * Web AR orchestration for the Viro renderer.
 *
 * The renderer (virocore/WASM) does not track — it just draws the scene from a
 * pose. Tracking runs in a *second* WASM module, slam-wasm, driven here in JS:
 * we capture the camera + IMU, feed them to slam, read back the 6-DoF pose,
 * convert it from slam's Z-up/OpenCV convention into virocore's Y-up/GL
 * convention, and inject it via the AR C API (ViroSceneApi.arSet*).
 *
 * This module is framework-agnostic (pure DOM); ViroARSceneNavigator wires it
 * into React and handles the permission UX.
 */

import type { ViroSceneApi } from "./sceneApi.js";
import { ViroTrackingState } from "./sceneApi.js";

/**
 * The raw slam-wasm engine (embind class "SlamEngine"; see slam
 * platforms/web/slam_wasm.cpp). Only the members we drive are typed.
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
  delete(): void;
}

/** The Emscripten module produced by slam_wasm.js (MODULARIZE + EXPORT_ES6). */
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

/** Pinhole intrinsics; if omitted they are derived from the capture resolution. */
export interface SlamIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1?: number;
  k2?: number;
  p1?: number;
  p2?: number;
}

/** SLAM tuning knobs (defaults mirror the slam demo). */
export interface SlamTuning {
  fastThreshold: number;
  gyroNoise: number;
  accelNoise: number;
  gyroBiasNoise: number;
  accelBiasNoise: number;
  lostThreshold: number;
  lostRecovery: number;
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
   * Loads the slam-wasm module factory. Kept pluggable so this package doesn't
   * hard-depend on how slam is packaged/served. Typically:
   *   loadSlam: () => import("@reactvision/slam-web")
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
  /** Override camera intrinsics (else derived from the actual capture size). */
  intrinsics?: SlamIntrinsics;
  /** Override SLAM tuning. */
  tuning?: Partial<SlamTuning>;
  /** Draw the live camera feed behind the scene. Default true. */
  showCameraBackground?: boolean;
  /** Reported each frame with the tracking state and quality [0,1]. */
  onStatus?: (state: ViroTrackingState, quality: number) => void;
  /** Called once if starting fails (permissions, no camera, slam load error). */
  onError?: (error: Error) => void;
}

// --- Axis conversion (slam Z-up/OpenCV → virocore Y-up/GL), ported from the
// slam demo (demo/index.html updateCamera). Quaternions are [x, y, z, w].
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

  constructor(options: ViroArSessionOptions) {
    this.opts = options;
    this.tuning = { ...DEFAULT_TUNING, ...(options.tuning ?? {}) };
  }

  /**
   * Requests camera/IMU access, boots slam, and starts injecting poses.
   * DeviceMotion permission (iOS Safari) must already be granted by the caller
   * from a user gesture; see ViroARSceneNavigator.
   */
  async start(): Promise<void> {
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
      );
      this.engine.start();

      this.canvas = document.createElement("canvas");
      this.canvas.width = capW;
      this.canvas.height = capH;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

      this.opts.sceneApi.initAR();
      this.opts.sceneApi.arSetCameraImageSize(capW, capH);

      this.startImu();

      this.running = true;
      this.loop();
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.stop();
    }
  }

  /** Stops capture, releases the camera, and tears down slam. */
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
      this.video.srcObject = null;
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
  }

  private async resolveSlamFactory(): Promise<SlamWasmFactory> {
    const loaded = await this.opts.loadSlam();
    if (typeof loaded === "function") return loaded;
    if (loaded && typeof loaded.default === "function") return loaded.default;
    throw new Error("loadSlam did not resolve to a slam-wasm factory");
  }

  private resolveIntrinsics(width: number, height: number): SlamIntrinsics {
    if (this.opts.intrinsics) return this.opts.intrinsics;
    // No calibration: assume a ~60° horizontal FOV pinhole centered on the image.
    // Good enough to bootstrap tracking; refine with a real calibration later.
    const f = 0.9 * width;
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
      // DeviceMotion rotationRate: alpha=Z, beta=X, gamma=Y (deg/s) → gx,gy,gz.
      this.engine.feedImu(
        ts,
        a.x ?? 0,
        a.y ?? 0,
        a.z ?? 0,
        (r.beta ?? 0) * deg,
        (r.gamma ?? 0) * deg,
        (r.alpha ?? 0) * deg,
      );
    };
    window.addEventListener("devicemotion", handler);
    this.imuHandler = handler;
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

    // Convert pose (Z-up/OpenCV) → virocore (Y-up/GL) and inject.
    const slamQuat: Quat = [engine.poseQx(), engine.poseQy(), engine.poseQz(), engine.poseQw()];
    const [px, py, pz] = quatRotateVec(FRAME_Q, [engine.posePx(), engine.posePy(), engine.posePz()]);
    const [qx, qy, qz, qw] = quatMul(quatMul(FRAME_Q, slamQuat), CAM_FLIP);
    this.opts.sceneApi.arSetPose(qx, qy, qz, qw, px, py, pz, state);

    if (this.opts.showCameraBackground !== false) {
      this.updateCameraBackground(rgba, w, h);
    }
  }

  /**
   * Upload the current camera frame as the scene background texture. GL samples
   * with v=0 at the bottom while getImageData is top-row-first, so flip rows.
   * NOTE: this recreates a texture each frame; a future viroUpdateTexture path
   * would avoid the churn.
   */
  private updateCameraBackground(rgba: Uint8ClampedArray, w: number, h: number): void {
    const flipped = new Uint8Array(w * h * 4);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = y * rowBytes;
      const dst = (h - 1 - y) * rowBytes;
      flipped.set(rgba.subarray(src, src + rowBytes), dst);
    }
    const tex = this.opts.sceneApi.createTextureRGBA(flipped, w, h, true);
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

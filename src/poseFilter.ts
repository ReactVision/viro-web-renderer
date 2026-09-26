/**
 * Pose smoothing for the web AR session.
 *
 * tinyvio is a keyframe-and-bundle-adjustment tracker, not a filter: every
 * frame's pose is a fresh solve, and nothing between it and the renderer
 * smoothed it. ARKit and ARCore fuse and smooth, so the same scene visibly shook
 * more in the web player than on device even while tracking was healthy.
 *
 * This is the One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass
 * whose cutoff rises with speed, so a still camera is smoothed hard and a moving
 * one barely lags. Position is filtered per axis; rotation is filtered as a
 * slerp toward the target by the same adaptive factor, from the angular speed.
 */

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export interface PoseFilterOptions {
  /** Cutoff in Hz at rest. Lower is smoother and laggier. Default 1.5. */
  minCutoff?: number;
  /** How fast the cutoff rises with speed. Higher lags less in motion. Default 0.8. */
  beta?: number;
  /** Cutoff in Hz for the speed estimate itself. Default 1. */
  derivativeCutoff?: number;
}

const DEFAULTS: Required<PoseFilterOptions> = { minCutoff: 1.5, beta: 0.8, derivativeCutoff: 1 };

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  // The shorter way round: q and -q are the same rotation.
  if (cos < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    cos = -cos;
  }
  let wa: number;
  let wb: number;
  if (cos > 0.9995) {
    wa = 1 - t;
    wb = t;
  } else {
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sin;
    wb = Math.sin(t * theta) / sin;
  }
  const q: Quat = [
    wa * a[0] + wb * bx,
    wa * a[1] + wb * by,
    wa * a[2] + wb * bz,
    wa * a[3] + wb * bw,
  ];
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function angleBetween(a: Quat, b: Quat): number {
  const cos = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(cos);
}

export class PoseFilter {
  private readonly o: Required<PoseFilterOptions>;
  private t = -1;
  private p: Vec3 = [0, 0, 0];
  private q: Quat = [0, 0, 0, 1];
  private dp = 0; // filtered linear speed, units/s
  private dq = 0; // filtered angular speed, rad/s

  constructor(options: PoseFilterOptions = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  /** Forget the history: the next pose passes through as-is. */
  reset(): void {
    this.t = -1;
    this.dp = 0;
    this.dq = 0;
  }

  /** Filter one pose taken at `tSec`. Returns the smoothed position and rotation. */
  apply(tSec: number, position: Vec3, rotation: Quat): { position: Vec3; rotation: Quat } {
    const dt = tSec - this.t;
    if (this.t < 0 || !(dt > 0) || dt > 0.5) {
      // First pose, a clock that went backwards, or a gap long enough that the
      // history describes a different moment: start over from this pose.
      this.t = tSec;
      this.p = [...position];
      this.q = [...rotation];
      this.dp = 0;
      this.dq = 0;
      return { position: [...position], rotation: [...rotation] };
    }
    this.t = tSec;

    const ad = alpha(this.o.derivativeCutoff, dt);

    const speed =
      Math.hypot(position[0] - this.p[0], position[1] - this.p[1], position[2] - this.p[2]) / dt;
    this.dp += ad * (speed - this.dp);
    const ap = alpha(this.o.minCutoff + this.o.beta * this.dp, dt);
    this.p = [
      this.p[0] + ap * (position[0] - this.p[0]),
      this.p[1] + ap * (position[1] - this.p[1]),
      this.p[2] + ap * (position[2] - this.p[2]),
    ];

    const angularSpeed = angleBetween(this.q, rotation) / dt;
    this.dq += ad * (angularSpeed - this.dq);
    const aq = alpha(this.o.minCutoff + this.o.beta * this.dq, dt);
    this.q = slerp(this.q, rotation, aq);

    return { position: [...this.p], rotation: [...this.q] };
  }
}

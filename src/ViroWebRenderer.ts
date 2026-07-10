import { loadViroWebModule } from "./loader";
import type { ViroWebModule, ViroWebRendererOptions } from "./types";

let selectorCounter = 0;

function resolveCanvas(canvas: HTMLCanvasElement | string): HTMLCanvasElement {
  if (typeof canvas === "string") {
    const el = document.querySelector(canvas);
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error(`ViroWebRenderer: selector "${canvas}" did not resolve to a <canvas>`);
    }
    return el;
  }
  return canvas;
}

/**
 * The WASM WebGL context is created C-side from a CSS selector, so the canvas
 * must be in the document and addressable by one. Ensure it has a unique id and
 * return the matching selector.
 */
function ensureSelector(canvas: HTMLCanvasElement): string {
  if (!canvas.isConnected) {
    throw new Error(
      "ViroWebRenderer: canvas must be attached to the DOM before init (the WebGL " +
        "context is created from a CSS selector).",
    );
  }
  if (!canvas.id) {
    canvas.id = `viro-web-canvas-${selectorCounter++}`;
  }
  return `#${CSS.escape(canvas.id)}`;
}

function computeSize(
  canvas: HTMLCanvasElement,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (width && height) {
    return { width, height };
  }
  const dpr = globalThis.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  return {
    width: width ?? Math.max(1, Math.round(rect.width * dpr)),
    height: height ?? Math.max(1, Math.round(rect.height * dpr)),
  };
}

/**
 * A running Viro WebGL2 renderer bound to a canvas. Create with
 * {@link ViroWebRenderer.create}; the render loop is driven internally by the
 * WASM module once initialized.
 *
 * NOTE (Phase 1): initialization currently builds a demo scene (a spinning
 * cube). The declarative scene / component C API arrives with the Phase 2
 * bridge; this class is the host those components will attach to.
 */
export class ViroWebRenderer {
  private disposed = false;

  private constructor(
    private readonly module: ViroWebModule,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  static async create(options: ViroWebRendererOptions): Promise<ViroWebRenderer> {
    const canvas = resolveCanvas(options.canvas);
    const selector = ensureSelector(canvas);
    const { width, height } = computeSize(canvas, options.width, options.height);

    canvas.width = width;
    canvas.height = height;

    const module = await loadViroWebModule(canvas, options.locateFile);
    module.initViroScene(selector, width, height);

    return new ViroWebRenderer(module, canvas);
  }

  /** Resize the renderer viewport. Omit args to recompute from the canvas's CSS size. */
  resize(width?: number, height?: number): void {
    this.assertLive();
    const size = computeSize(this.canvas, width, height);
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.module.setViroSceneSize(size.width, size.height);
  }

  /** The canvas this renderer is bound to. */
  get canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /** The underlying Emscripten module (escape hatch for advanced use). */
  get wasmModule(): ViroWebModule {
    return this.module;
  }

  /**
   * Release references. NOTE: the WASM main loop is not yet stoppable from the
   * C API — a proper teardown (emscripten_cancel_main_loop + context destroy)
   * is a follow-up. For now this just marks the instance unusable.
   */
  dispose(): void {
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error("ViroWebRenderer: instance has been disposed");
    }
  }
}

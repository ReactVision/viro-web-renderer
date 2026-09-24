import { loadViroWebModule } from "./loader.js";
import {
  ViroSceneApi,
  ViroEventAction,
  ViroModelFormat,
  type ViroHandle,
  type ViroNodeEventHandlers,
  type ViroAnimationHandlers,
} from "./sceneApi.js";
import { ViroRendererAbortError } from "./types.js";
import type { ViroWebModule, ViroWebRendererOptions } from "./types.js";

const MODEL_EXT: Record<ViroModelFormat, string> = {
  [ViroModelFormat.GLB]: "glb",
  [ViroModelFormat.GLTF]: "gltf",
  [ViroModelFormat.VRX]: "vrx",
  [ViroModelFormat.OBJ]: "obj",
};

let selectorCounter = 0;
let lightingEnvCounter = 0;

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
 * `create()` gives you an empty scene. Build into it through {@link scene},
 * the handle-based API the Viro web bridge's reconciler drives.
 */
export class ViroWebRenderer {
  private disposed = false;
  private detachInput?: () => void;
  private readonly _scene: ViroSceneApi;
  private readonly eventHandlers = new Map<ViroHandle, ViroNodeEventHandlers>();
  private readonly modelLoadResolvers = new Map<ViroHandle, (success: boolean) => void>();
  private readonly animationHandlers = new Map<ViroHandle, ViroAnimationHandlers>();
  private readonly abortListeners = new Set<(error: ViroRendererAbortError) => void>();
  private abortError: ViroRendererAbortError | null = null;

  private constructor(
    private readonly module: ViroWebModule,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this._scene = new ViroSceneApi(module);
    // One native callback fans events out to per-node handlers.
    module.viroSetEventCallback(
      (handle, action, source, intArg, x, y, z) => {
        this.dispatchEvent(handle, action, source, intArg, [x, y, z]);
      },
    );
    // One native callback resolves per-node model-load promises.
    module.viroSetModelLoadCallback((handle, success) => {
      const resolve = this.modelLoadResolvers.get(handle);
      if (resolve) {
        this.modelLoadResolvers.delete(handle);
        resolve(success);
      }
    });
    // One native callback fans animation start/finish out to per-node handlers.
    module.viroSetAnimationCallback((handle, eventType) => {
      const handlers = this.animationHandlers.get(handle);
      if (!handlers) return;
      if (eventType === 0) handlers.onStart?.();
      else if (eventType === 1) handlers.onFinish?.();
    });
  }

  /** Register (or replace) animation lifecycle handlers for a node. */
  setNodeAnimationHandlers(handle: ViroHandle, handlers: ViroAnimationHandlers): void {
    this.animationHandlers.set(handle, handlers);
  }

  /** Remove a node's animation handlers. */
  clearNodeAnimationHandlers(handle: ViroHandle): void {
    this.animationHandlers.delete(handle);
  }

  /**
   * mkdirTree is idempotent; mkdir is not and throws EEXIST on the second load
   * into the same node, which is a normal thing for a scene to do.
   */
  private mkdirIfMissing(dir: string): void {
    if (this.module.FS.mkdirTree) {
      this.module.FS.mkdirTree(dir);
      return;
    }
    try {
      this.module.FS.mkdir?.(dir);
    } catch {
      // Already there.
    }
  }

  /**
   * Load a model (GLB/glTF/VRX/OBJ) into a node handle. Writes the bytes to the
   * WASM virtual FS, then invokes the native loader. Resolves when the loader
   * finishes (texture hydration continues asynchronously afterward).
   *
   * `resources` are the files the model references by name — an OBJ's .mtl and
   * the textures that .mtl names, or a VRX's PNGs.
   */
  loadModel(
    nodeHandle: ViroHandle,
    bytes: Uint8Array,
    format: ViroModelFormat,
    resources: Array<{ name: string; bytes: Uint8Array }> = [],
  ): Promise<boolean> {
    // OBJ resolves its .mtl and textures against the directory the .obj sits in,
    // so it gets one of its own. The shared root would resolve too, but there two
    // models that both reference "wood.png" overwrite each other.
    const dir = format === ViroModelFormat.OBJ ? `/viro_model_${nodeHandle}` : "";
    if (dir) {
      this.mkdirIfMissing(dir);
    }

    // External resources must be written under the names the model references,
    // so the loader resolves them.
    for (const res of resources) {
      this.module.FS.writeFile(`${dir}/${res.name}`, res.bytes);
    }
    const path = `${dir}/viro_model_${nodeHandle}.${MODEL_EXT[format]}`;
    this.module.FS.writeFile(path, bytes);
    return new Promise<boolean>((resolve) => {
      // One resolver per node, and a second load replaces the first. Settle the
      // one being replaced rather than dropping it: the native callback carries
      // only the node handle, so it can never arrive for the superseded load,
      // and an awaiter of it would wait for the rest of the session.
      this.modelLoadResolvers.get(nodeHandle)?.(false);
      this.modelLoadResolvers.set(nodeHandle, resolve);
      this.module.viroLoadModel(nodeHandle, path, format);
    });
  }

  /**
   * Load a radiance .hdr from a URL and apply it as the scene's IBL lighting
   * environment. Fetches the bytes, writes them to the WASM FS, then loads +
   * applies via the C API. Returns the texture handle (0 on failure).
   */
  async loadLightingEnvironment(url: string): Promise<ViroHandle> {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const path = `/viro_env_${lightingEnvCounter++}.hdr`;
    this.module.FS.writeFile(path, bytes);
    const handle = this._scene.loadRadianceHDRTexture(path);
    if (handle) this._scene.setLightingEnvironment(handle);
    return handle;
  }

  /** Clear the scene's IBL lighting environment. */
  clearLightingEnvironment(): void {
    this._scene.setLightingEnvironment(0);
  }

  /** Typed scene-graph API the bridge reconciler drives to build/update the scene. */
  get scene(): ViroSceneApi {
    return this._scene;
  }

  /** Backing-store size of the canvas in device pixels (for hit-test unprojection). */
  get canvasSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  /** Register (or replace) event handlers for a node handle. */
  setNodeEventHandlers(handle: ViroHandle, handlers: ViroNodeEventHandlers): void {
    this.eventHandlers.set(handle, handlers);
  }

  /** Remove a node's event handlers (call on unmount). */
  clearNodeEventHandlers(handle: ViroHandle): void {
    this.eventHandlers.delete(handle);
  }

  private dispatchEvent(
    handle: ViroHandle,
    action: number,
    source: number,
    intArg: number,
    position: [number, number, number],
  ): void {
    const handlers = this.eventHandlers.get(handle);
    if (!handlers) return;
    if (action === ViroEventAction.Click) {
      handlers.onClick?.(intArg, source, position);
    } else if (action === ViroEventAction.Hover) {
      handlers.onHover?.(intArg === 1, source, position);
    }
  }

  static async create(options: ViroWebRendererOptions): Promise<ViroWebRenderer> {
    const canvas = resolveCanvas(options.canvas);
    const selector = ensureSelector(canvas);
    const { width, height } = computeSize(canvas, options.width, options.height);

    canvas.width = width;
    canvas.height = height;

    // The runtime can abort before there is a renderer to tell (during init);
    // create() then rejects on its own and there is no one else to notify.
    let renderer: ViroWebRenderer | undefined;
    const module = await loadViroWebModule(canvas, {
      locateFile: options.locateFile,
      baseUrl: options.assetBaseUrl,
      importGlue: options.importGlue,
      onAbort: (what) => renderer?.handleAbort(what),
    });
    module.initViroScene(selector, width, height);

    renderer = new ViroWebRenderer(module, canvas);
    if (options.onAbort) renderer.addAbortListener(options.onAbort);
    // Once, at startup: what a bug report needs pasted back and cannot find
    // anywhere else, since the binary reaches an app through two hand copies.
    const buildId = renderer.scene.getBuildId();
    if (buildId) {
      console.log("[Viro web] renderer build " + buildId);
    }
    renderer.attachInput();
    return renderer;
  }

  /**
   * Forward canvas pointer events to the renderer as touch actions, converting
   * CSS coordinates to the canvas's device-pixel backing store.
   */
  private attachInput(): void {
    const canvas = this.canvas;
    const send = (action: number, e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      this.module.viroOnTouch(action, x, y);
    };

    const onDown = (e: PointerEvent) => send(0, e);
    const onMove = (e: PointerEvent) => send(1, e);
    const onUp = (e: PointerEvent) => send(2, e);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    this.detachInput = () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
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
   * Release references and stop responding to input.
   *
   * NOTE: the WASM main loop is not stoppable from the C API yet — a proper
   * teardown (emscripten_cancel_main_loop + context destroy) is a follow-up.
   * Until then a disposed renderer keeps drawing, so an app that mounts and
   * unmounts repeatedly accumulates render loops. Create one and keep it.
   *
   * Any model load still in flight is settled as failed: its native callback
   * would have nowhere to arrive.
   */
  dispose(): void {
    this.detachInput?.();
    this.detachInput = undefined;
    for (const resolve of this.modelLoadResolvers.values()) resolve(false);
    this.modelLoadResolvers.clear();
    this.eventHandlers.clear();
    this.animationHandlers.clear();
    this.disposed = true;
  }

  /**
   * Set once the WASM runtime has aborted (see ViroWebRendererOptions.onAbort).
   * A renderer in that state cannot recover; a new one has to be created.
   */
  get abortedWith(): ViroRendererAbortError | null {
    return this.abortError;
  }

  /**
   * Be told when the runtime aborts. Called at most once per renderer, and
   * straight away when it already has. Returns an unsubscribe.
   */
  addAbortListener(listener: (error: ViroRendererAbortError) => void): () => void {
    if (this.abortError) {
      listener(this.abortError);
      return () => {};
    }
    this.abortListeners.add(listener);
    return () => {
      this.abortListeners.delete(listener);
    };
  }

  private handleAbort(what: unknown): void {
    if (this.abortError) return;
    // Emscripten passes "OOM" for a heap that could not grow and nothing at all
    // for most other aborts, a failed allocation past MAXIMUM_MEMORY included.
    const reason = (what instanceof Error ? what.message : String(what ?? "")) || "unknown";
    this.abortError = new ViroRendererAbortError(reason);
    // Nothing in flight can finish: the loader that would call back is gone.
    for (const resolve of this.modelLoadResolvers.values()) resolve(false);
    this.modelLoadResolvers.clear();
    const listeners = [...this.abortListeners];
    this.abortListeners.clear();
    for (const listener of listeners) {
      try {
        listener(this.abortError);
      } catch (err) {
        console.error("[Viro web] onAbort listener threw:", err);
      }
    }
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error("ViroWebRenderer: instance has been disposed");
    }
  }
}

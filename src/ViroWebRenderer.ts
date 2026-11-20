import { loadViroWebModule } from "./loader.js";
import {
  ViroSceneApi,
  ViroEventAction,
  ViroModelFormat,
  type ViroHandle,
  type ViroNodeEventHandlers,
  type ViroControllerEventHandlers,
  type ViroAnimationHandlers,
} from "./sceneApi.js";
import { ViroRendererAbortError } from "./types.js";
import type { LocateFile, ViroWebModule, ViroWebRendererOptions } from "./types.js";

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
/** Context loss notifications; see ViroWebRenderer.isContextLost. */
export interface ViroContextListener {
  onLost?: () => void;
  onRestored?: () => void;
}

// The event callback's node handle for the ViroController delegate; node handles start at 1.
const CONTROLLER_HANDLE = 0;

export class ViroWebRenderer {
  private disposed = false;
  private detachInput?: () => void;
  private readonly _scene: ViroSceneApi;
  private readonly eventHandlers = new Map<ViroHandle, ViroNodeEventHandlers>();
  // Last registered wins, as on native where the scene that appears last sets
  // the delegate. A stack, so a scene that mounts before the previous one
  // unmounts is not switched off by that unmount.
  private controllerHandlers: { owner: object; handlers: ViroControllerEventHandlers }[] = [];
  private readonly modelLoadResolvers = new Map<ViroHandle, (success: boolean) => void>();
  private readonly animationHandlers = new Map<ViroHandle, ViroAnimationHandlers>();
  private readonly abortListeners = new Set<(error: ViroRendererAbortError) => void>();
  private readonly textFaces = new Map<string, Promise<boolean>>();
  private abortError: ViroRendererAbortError | null = null;
  private contextLost = false;
  private readonly contextListeners = new Set<ViroContextListener>();
  private detachContext?: () => void;

  private constructor(
    private readonly module: ViroWebModule,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this._scene = new ViroSceneApi(module);
    // One native callback fans events out to per-node handlers.
    module.viroSetEventCallback(
      (handle, action, source, intArg, x, y, z, posCount) => {
        if (handle === CONTROLLER_HANDLE) {
          this.dispatchControllerEvent(action, source, intArg, [x, y, z], posCount ?? 3);
          return;
        }
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
    const written = [path, ...resources.map((res) => `${dir}/${res.name}`)];
    return new Promise<boolean>((resolve) => {
      // One resolver per node, and a second load replaces the first. Settle the
      // one being replaced rather than dropping it: the native callback carries
      // only the node handle, so it can never arrive for the superseded load,
      // and an awaiter of it would wait for the rest of the session.
      this.modelLoadResolvers.get(nodeHandle)?.(false);
      this.modelLoadResolvers.set(nodeHandle, resolve);
      this.module.viroLoadModel(nodeHandle, path, format);
    }).finally(() => this.unlinkAll(written));
  }

  /**
   * The loaders read the virtual FS synchronously and are done with it by the
   * time the load settles. MEMFS keeps every file in JS memory until unlinked,
   * so without this each model stayed resident for the life of the page, once
   * per load.
   */
  private unlinkAll(paths: string[]): void {
    const unlink = this.module.FS.unlink;
    if (!unlink) return;
    for (const p of paths) {
      try {
        unlink.call(this.module.FS, p);
      } catch {
        // Already gone, or a second load into the node replaced it.
      }
    }
  }

  /**
   * Makes the face a text at `weight` (100 to 900) and `italic` draws in ready
   * to use. Only the regular face is preloaded; the others are served beside
   * the wasm and fetched the first time a text asks for them, and stay in the
   * FS after. Resolves false when the face could not be had, in which case
   * such a text draws in the regular face.
   */
  loadTextFace(weight = 400, italic = false): Promise<boolean> {
    const file = this.module.viroTextFaceFile?.(weight, italic);
    if (!file || file === "Roboto") return Promise.resolve(true);
    let pending = this.textFaces.get(file);
    if (!pending) {
      const locate = this.module.locateFile as LocateFile | undefined;
      const url = locate ? locate(`${file}.ttf`, "") : `${file}.ttf`;
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buf) => {
          this.module.FS.writeFile(`/${file}.ttf`, new Uint8Array(buf));
          return true;
        })
        .catch((err) => {
          console.warn(`[Viro web] could not load the ${file} face from ${url} (${err}); drawing that text in Roboto`);
          // Asked again next time, rather than failing for the rest of the page.
          this.textFaces.delete(file);
          return false;
        });
      this.textFaces.set(file, pending);
    }
    return pending;
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
    let handle: ViroHandle;
    try {
      handle = this._scene.loadRadianceHDRTexture(path);
    } finally {
      this.unlinkAll([path]);
    }
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

  /**
   * Registers (or replaces) an owner's ViroController handlers. The latest owner
   * receives the events. Returns false on a binary without the controller delegate.
   */
  setControllerEventHandlers(owner: object, handlers: ViroControllerEventHandlers): boolean {
    if (!this._scene.supportsController) return false;
    const existing = this.controllerHandlers.find((entry) => entry.owner === owner);
    if (existing) existing.handlers = handlers;
    else this.controllerHandlers.push({ owner, handlers });
    this.applyControllerEvents();
    return true;
  }

  clearControllerEventHandlers(owner: object): void {
    const before = this.controllerHandlers.length;
    this.controllerHandlers = this.controllerHandlers.filter((entry) => entry.owner !== owner);
    if (this.controllerHandlers.length !== before) this.applyControllerEvents();
  }

  private applyControllerEvents(): void {
    const top = this.controllerHandlers[this.controllerHandlers.length - 1]?.handlers;
    this._scene.setControllerEventEnabled(ViroEventAction.Click, !!top?.onClick);
    this._scene.setControllerEventEnabled(ViroEventAction.Pinch, !!top?.onPinch);
    this._scene.setControllerEventEnabled(ViroEventAction.Rotate, !!top?.onRotate);
    this._scene.setControllerEventEnabled(ViroEventAction.Fuse, !!top?.onFuse);
  }

  private dispatchControllerEvent(
    action: number,
    source: number,
    intArg: number,
    position: [number, number, number],
    posCount: number,
  ): void {
    const handlers = this.controllerHandlers[this.controllerHandlers.length - 1]?.handlers;
    if (!handlers) return;
    if (action === ViroEventAction.Click) {
      handlers.onClick?.(intArg, source, posCount === 0 ? [] : position);
    } else if (action === ViroEventAction.Pinch) {
      handlers.onPinch?.(intArg, position[0], source);
    } else if (action === ViroEventAction.Rotate) {
      handlers.onRotate?.(intArg, position[0], source);
    } else if (action === ViroEventAction.Fuse) {
      handlers.onFuse?.(source);
    }
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
    } else if (action === ViroEventAction.Pinch) {
      handlers.onPinch?.(intArg, position[0], source);
    } else if (action === ViroEventAction.Rotate) {
      handlers.onRotate?.(intArg, position[0], source);
    } else if (action === ViroEventAction.Fuse) {
      handlers.onFuse?.(source);
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
    renderer.attachContextLoss();
    return renderer;
  }

  /**
   * Forward canvas pointer events to the renderer as touch actions, converting
   * CSS coordinates to the canvas's device-pixel backing store.
   *
   * A second finger turns the touch into a pinch and a rotate, as on a phone:
   * the first finger's press is cancelled without a click, both gestures start
   * on the node under the fingers' midpoint, and nothing more reaches the scene
   * until every finger has lifted. `pointercancel` cancels the press too, for
   * any pointer id (the virtual camera sends one when it takes two fingers).
   */
  private attachInput(): void {
    const canvas = this.canvas;
    const m = this.module;
    const toCanvas = (clientX: number, clientY: number): [number, number] | null => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return [(clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height)];
    };
    const send = (action: number, e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY);
      if (p) m.viroOnTouch(action, p[0], p[1]);
    };

    const fingers = new Map<number, { x: number; y: number }>();
    // Starts on the first move, as iOS and Android recognisers do: two fingers
    // that land and lift without moving are no gesture at all.
    let gesture: { spread: number; angle: number; started: boolean; at: [number, number] } | null = null;
    // Set once a gesture starts and cleared when the last finger lifts.
    let held = false;
    const pair = () => {
      const [a, b] = [...fingers.values()];
      return {
        mid: toCanvas((a!.x + b!.x) / 2, (a!.y + b!.y) / 2),
        spread: Math.hypot(b!.x - a!.x, b!.y - a!.y),
        angle: Math.atan2(b!.y - a!.y, b!.x - a!.x),
      };
    };
    const gestureEvent = (state: number, scale: number, radians: number, at: [number, number]) => {
      m.viroOnPinch!(state, scale, at[0], at[1]);
      m.viroOnRotate!(state, radians, at[0], at[1]);
    };
    let last = { scale: 1, radians: 0, at: [0, 0] as [number, number] };
    const endGesture = () => {
      if (gesture?.started) gestureEvent(3, last.scale, last.radians, last.at);
      gesture = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" && typeof m.viroOnPinch === "function") {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size === 2 && !held) {
          held = true;
          m.viroOnTouch(3, 0, 0);
          const p = pair();
          if (p.mid && p.spread > 0) {
            gesture = { spread: p.spread, angle: p.angle, started: false, at: p.mid };
            last = { scale: 1, radians: 0, at: p.mid };
          }
        }
        if (held) return;
      }
      send(0, e);
    };
    // A mouse moves the hover, as a headset's controller ray does, and leaving
    // the canvas hands it back to the screen-centre gaze. Touch and pen never
    // hover, so phones and AR keep the gaze.
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || typeof m.viroOnPointerHover !== "function") return;
      const p = toCanvas(e.clientX, e.clientY);
      if (p) m.viroOnPointerHover(true, p[0], p[1]);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") m.viroOnPointerHover?.(false, 0, 0);
    };

    const onMove = (e: PointerEvent) => {
      hover(e);
      if (fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (held) {
          if (gesture && fingers.size >= 2) {
            if (!gesture.started) {
              gesture.started = true;
              gestureEvent(1, 1, 0, gesture.at);
            }
            const p = pair();
            // Screen y points down, so a clockwise turn grows the angle; native
            // reports counterclockwise as positive.
            let turn = gesture.angle - p.angle;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            last = { scale: p.spread / gesture.spread, radians: last.radians + turn, at: p.mid ?? last.at };
            gesture.angle = p.angle;
            gestureEvent(2, last.scale, last.radians, last.at);
          }
          return;
        }
      }
      send(1, e);
    };
    const onUp = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      if (held) {
        if (fingers.size < 2) endGesture();
        if (fingers.size === 0) held = false;
        return;
      }
      send(2, e);
    };
    // Any id ends the press: the virtual camera cancels with the second finger's
    // id and then keeps both fingers' events to itself.
    const onCancel = (e: PointerEvent) => {
      if (held) {
        onUp(e);
        return;
      }
      fingers.clear();
      m.viroOnTouch(3, 0, 0);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);

    this.detachInput = () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
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
   * Stops the render loop on a binary that can (older ones keep drawing).
   *
   * Any model load still in flight is settled as failed: its native callback
   * would have nowhere to arrive.
   */
  dispose(): void {
    this.module.viroStopMainLoop?.();
    this.detachInput?.();
    this.detachInput = undefined;
    this.detachContext?.();
    this.detachContext = undefined;
    this.contextListeners.clear();
    for (const resolve of this.modelLoadResolvers.values()) resolve(false);
    this.modelLoadResolvers.clear();
    this.eventHandlers.clear();
    this.controllerHandlers = [];
    this.animationHandlers.clear();
    this.disposed = true;
  }

  /**
   * True once the browser has taken the WebGL context away (a GPU reset, or a
   * mobile browser reclaiming memory). Nothing this renderer made comes back
   * with the context: when it is restored, dispose this renderer and create a
   * new one on the same canvas.
   */
  get isContextLost(): boolean {
    return this.contextLost;
  }

  /** Be told when the context is lost and when it is back. Returns an unsubscribe. */
  addContextListener(listener: ViroContextListener): () => void {
    this.contextListeners.add(listener);
    return () => {
      this.contextListeners.delete(listener);
    };
  }

  private attachContextLoss(): void {
    const canvas = this.canvas;
    const onLost = (e: Event) => {
      // Without this the browser never restores the context.
      e.preventDefault();
      this.contextLost = true;
      this.module.viroStopMainLoop?.();
      for (const l of [...this.contextListeners]) l.onLost?.();
    };
    const onRestored = () => {
      for (const l of [...this.contextListeners]) l.onRestored?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.detachContext = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
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

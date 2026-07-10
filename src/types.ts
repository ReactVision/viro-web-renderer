/**
 * Public types for @reactvision/viro-web-renderer.
 */

/** How the .wasm / .data sidecar files are located, for advanced/bundler use. */
export type LocateFile = (path: string, scriptDirectory: string) => string;

/**
 * The Emscripten module instance produced by the WASM glue. Only the functions
 * exposed via EMSCRIPTEN_BINDINGS (see wasm/src/cpp/VROSceneWeb.cpp) are typed;
 * the rest of the Emscripten runtime surface is intentionally left open.
 */
export interface ViroWebModule {
  /** Initialize the renderer on the given canvas (CSS selector) and start the loop. */
  initViroScene(canvasSelector: string, width: number, height: number): void;
  /** Update the renderer's viewport size (device pixels). */
  setViroSceneSize(width: number, height: number): void;

  canvas?: HTMLCanvasElement;
  // Emscripten runtime internals (locateFile, HEAPU8, etc.) are not typed here.
  [key: string]: unknown;
}

/** The default export of the Emscripten MODULARIZE + EXPORT_ES6 glue. */
export type ViroWebModuleFactory = (
  moduleArg?: Partial<ViroWebModule>,
) => Promise<ViroWebModule>;

export interface ViroWebRendererOptions {
  /** The target <canvas>, or a CSS selector that resolves to one in the DOM. */
  canvas: HTMLCanvasElement | string;
  /**
   * Backing-store size in device pixels. If omitted, computed from the canvas's
   * displayed (CSS) size multiplied by devicePixelRatio.
   */
  width?: number;
  height?: number;
  /** Override how the .wasm/.data sidecars are located (advanced/bundler use). */
  locateFile?: LocateFile;
}

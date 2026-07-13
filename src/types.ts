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

  /** Feed a pointer/touch event. action: 0 = down, 1 = move, 2 = up. x/y in device pixels. */
  viroOnTouch(action: number, x: number, y: number): void;

  /** Build the hardcoded demo cube scene (smoke test). */
  viroBuildDemoCube(): void;

  // --- Scene graph C API (handle-based). Handles are opaque ints; 0 = invalid. ---
  viroCreateNode(): number;
  viroGetRootNode(): number;
  viroSetNodePosition(node: number, x: number, y: number, z: number): void;
  viroSetNodeRotation(node: number, x: number, y: number, z: number): void;
  viroSetNodeScale(node: number, x: number, y: number, z: number): void;
  viroSetNodeOpacity(node: number, opacity: number): void;
  viroSetNodeVisible(node: number, visible: boolean): void;
  viroSetNodeGeometry(node: number, geometry: number): void;
  viroAddChildNode(parent: number, child: number): void;
  viroRemoveNodeFromParent(node: number): void;
  viroDestroyNode(node: number): void;

  viroCreateBox(width: number, height: number, length: number): number;
  viroCreateSphere(radius: number): number;
  viroCreateSurface(width: number, height: number): number;
  viroSetGeometryMaterial(geometry: number, material: number): void;
  viroDestroyGeometry(geometry: number): void;

  viroCreateMaterial(): number;
  viroSetMaterialDiffuseColor(material: number, r: number, g: number, b: number, a: number): void;
  viroSetMaterialLightingModel(material: number, model: number): void;
  viroDestroyMaterial(material: number): void;

  // Events: register one callback; WASM invokes it as
  // (nodeHandle, eventAction, source, intArg, x, y, z).
  viroSetEventCallback(
    callback: (
      nodeHandle: number,
      eventAction: number,
      source: number,
      intArg: number,
      x: number,
      y: number,
      z: number,
    ) => void,
  ): void;
  viroSetNodeEventEnabled(node: number, eventAction: number, enabled: boolean): void;

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
  /**
   * Base URL (dir) where viro-web.js/.wasm/.data are served. Set this when a
   * bundler rewrites import.meta.url (Vite/webpack) or when hosting assets on a
   * CDN/public path. Also settable globally via globalThis.VIRO_WEB_ASSET_BASE.
   */
  assetBaseUrl?: string;
  /**
   * Custom loader for the Emscripten glue module (for bundlers that can't
   * dynamically import a runtime URL). See LoadOptions.importGlue.
   */
  importGlue?: () => Promise<{ default?: ViroWebModuleFactory } | ViroWebModuleFactory>;
}

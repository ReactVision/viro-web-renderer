import type { LocateFile, ViroWebModule, ViroWebModuleFactory } from "./types.js";

/**
 * Resolve the base URL (ending in "/") where the WASM assets
 * (viro-web.js/.wasm/.data) are served from. Resolution order:
 *
 *   1. explicit `baseUrl` argument (from ViroWebRenderer options)
 *   2. `globalThis.VIRO_WEB_ASSET_BASE` — set this when a bundler (Vite/webpack)
 *      rewrites `import.meta.url` and breaks relative resolution, or when assets
 *      are hosted elsewhere (CDN, /public, etc.)
 *   3. `new URL("../wasm/", import.meta.url)` — the default for direct ESM use,
 *      where the glue sits next to this module under the package's wasm/ dir.
 */
function resolveAssetBase(baseUrl?: string): string {
  const explicit = baseUrl ?? (globalThis as { VIRO_WEB_ASSET_BASE?: string }).VIRO_WEB_ASSET_BASE;
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit.endsWith("/") ? explicit : explicit + "/";
  }
  return new URL("../wasm/", import.meta.url).href;
}

/**
 * Load and instantiate the WASM renderer module.
 *
 * The Emscripten glue (viro-web.js) is fetched from the asset base at runtime
 * rather than bundled, so the ~2MB payload is only paid for on demand. The
 * .wasm/.data sidecars are located from the same base (see resolveAssetBase).
 */
export interface LoadOptions {
  locateFile?: LocateFile;
  baseUrl?: string;
  /**
   * Custom loader for the Emscripten glue module. Provide this under bundlers
   * that can't dynamically import a runtime URL (e.g. Vite: pass
   * `() => import("./viro-web.js?url").then(u => import(u.default))`, or import
   * the glue directly). When set, you should also provide `locateFile` (or
   * `baseUrl`) so the .wasm/.data sidecars resolve correctly.
   */
  importGlue?: () => Promise<{ default?: ViroWebModuleFactory } | ViroWebModuleFactory>;
}

export async function loadViroWebModule(
  canvas: HTMLCanvasElement,
  opts: LoadOptions = {},
): Promise<ViroWebModule> {
  const base = resolveAssetBase(opts.baseUrl);

  let imported: { default?: ViroWebModuleFactory } | ViroWebModuleFactory;
  if (opts.importGlue) {
    imported = await opts.importGlue();
  } else {
    const glueUrl = base + "viro-web.js";
    // Indirect so no bundler parses a non-literal import(). Metro rejects one
    // outright, and strips the webpackIgnore comment before it would help.
    const importModule = new Function("u", "return import(u)") as (
      u: string,
    ) => Promise<{ default?: ViroWebModuleFactory } | ViroWebModuleFactory>;
    imported = await importModule(glueUrl);
  }

  const factory = ((imported as { default?: ViroWebModuleFactory }).default ??
    imported) as ViroWebModuleFactory;

  // Pin .wasm/.data resolution to the same base. Without this, Emscripten
  // resolves the preloaded .data against the host page's URL (→ 404) instead of
  // where the assets actually live.
  const moduleArg: Partial<ViroWebModule> = { canvas };
  (moduleArg as { locateFile?: LocateFile }).locateFile =
    opts.locateFile ?? ((path: string) => base + path);

  return factory(moduleArg);
}

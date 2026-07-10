import type { LocateFile, ViroWebModule, ViroWebModuleFactory } from "./types.js";

/**
 * Load and instantiate the WASM renderer module.
 *
 * The Emscripten glue (wasm/viro-web.js) is imported dynamically so bundlers
 * treat it as an async chunk and the ~2MB payload is only fetched on demand.
 * The .wasm/.data sidecars sit next to the glue and are located relative to it
 * by default; pass `locateFile` to override for custom asset hosting.
 */
export async function loadViroWebModule(
  canvas: HTMLCanvasElement,
  locateFile?: LocateFile,
): Promise<ViroWebModule> {
  // Resolve the glue relative to this file at runtime (dist/ -> ../wasm/) so we
  // avoid a static import that TS would try to type-check / place under rootDir.
  const wasmBase = new URL("../wasm/", import.meta.url).href;
  const glueUrl = wasmBase + "viro-web.js";
  const imported: { default?: ViroWebModuleFactory } = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ glueUrl
  );

  const factory = (imported.default ?? imported) as ViroWebModuleFactory;

  // Pin .wasm/.data resolution to the glue's own directory. Without this,
  // Emscripten resolves the preloaded .data against the host page's URL
  // (e.g. /example/viro-web.data -> 404) instead of the package's wasm/ dir.
  const moduleArg: Partial<ViroWebModule> = { canvas };
  (moduleArg as { locateFile?: LocateFile }).locateFile =
    locateFile ?? ((path: string) => wasmBase + path);

  return factory(moduleArg);
}

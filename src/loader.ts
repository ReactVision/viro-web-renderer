import type { LocateFile, ViroWebModule, ViroWebModuleFactory } from "./types";

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
  const glueUrl = new URL("../wasm/viro-web.js", import.meta.url).href;
  const imported: { default?: ViroWebModuleFactory } = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ glueUrl
  );

  const factory = (imported.default ?? imported) as ViroWebModuleFactory;

  const moduleArg: Partial<ViroWebModule> = { canvas };
  if (locateFile) {
    (moduleArg as { locateFile?: LocateFile }).locateFile = locateFile;
  }

  return factory(moduleArg);
}

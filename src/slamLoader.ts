import type { SlamWasmFactory } from "./arSession.js";

/**
 * Loading the bundled tracking engine.
 *
 * The engine is tinyvio, shipped in this package under `slam/` so that web AR
 * works from an `npm install` alone. Before it was bundled, every consumer had
 * to obtain and host two files themselves, from a repository most of them could
 * not open.
 *
 * It is not an ES module. tinyvio builds it with `MODULARIZE` and deliberately
 * without `EXPORT_ES6`, so it cannot be `import()`ed the way the renderer glue
 * can: it has to be run as a classic script, which leaves a `SlamModule`
 * factory behind. That is the whole reason this file exists rather than a
 * two-line dynamic import.
 */

type SlamGlobal = { SlamModule?: SlamWasmFactory };

/**
 * Resolve the directory the engine's two files are served from. Same order as
 * the renderer's asset base, for the same reasons:
 *
 *   1. explicit `baseUrl` (from ViroArSessionOptions.slamBaseUrl)
 *   2. `globalThis.VIRO_SLAM_ASSET_BASE`, for when a bundler rewrites
 *      `import.meta.url` or the files are hosted elsewhere (CDN, /public)
 *   3. `new URL("../slam/", import.meta.url)` — the package's own copy
 */
function resolveSlamBase(baseUrl?: string): string {
  const explicit =
    baseUrl ?? (globalThis as { VIRO_SLAM_ASSET_BASE?: string }).VIRO_SLAM_ASSET_BASE;
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit.endsWith("/") ? explicit : explicit + "/";
  }
  return new URL("../slam/", import.meta.url).href;
}

/** Injected scripts, by URL, so a second session does not load the engine twice. */
const inFlight = new Map<string, Promise<SlamWasmFactory>>();

/**
 * Load the bundled engine and return its factory.
 *
 * Resolves to the same factory on every call for a given URL: the engine is a
 * global once its script has run, and injecting it again would re-execute a
 * 265 KB module to arrive back at the object already sitting there.
 */
export function loadBundledSlam(baseUrl?: string): Promise<SlamWasmFactory> {
  const base = resolveSlamBase(baseUrl);
  const url = base + "tinyvio-slam.js";

  const existing = inFlight.get(url);
  if (existing) return existing;

  const pending = new Promise<SlamWasmFactory>((resolve, reject) => {
    const already = (globalThis as SlamGlobal).SlamModule;
    if (typeof already === "function") {
      resolve(already);
      return;
    }

    if (typeof document === "undefined") {
      reject(
        new Error(
          "the tracking engine needs a DOM to load: it is a classic script, not " +
            "an ES module. Supply `loadSlam` yourself in a non-DOM host.",
        ),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      const factory = (globalThis as SlamGlobal).SlamModule;
      if (typeof factory === "function") {
        resolve(factory);
      } else {
        // The script ran and left nothing behind, which in practice means the
        // URL served something that is not the engine -- an index.html from a
        // dev server's catch-all route is the usual one, and it fails silently
        // rather than as a 404.
        reject(
          new Error(
            `loaded ${url} but no global 'SlamModule' appeared; check that the ` +
              "URL serves the engine and not an HTML fallback",
          ),
        );
      }
    };
    script.onerror = () =>
      reject(
        new Error(
          `could not load the tracking engine from ${url}. It ships in this ` +
            "package under slam/; set `slamBaseUrl` (or globalThis." +
            "VIRO_SLAM_ASSET_BASE) if your bundler serves it elsewhere.",
        ),
      );
    document.head.appendChild(script);
  });

  // A failed load must not be cached: the usual cause is a path the caller can
  // fix and retry, and a cached rejection would keep failing after they had.
  pending.catch(() => inFlight.delete(url));
  inFlight.set(url, pending);
  return pending;
}

/**
 * Where the engine should look for its `.wasm`.
 *
 * Emscripten resolves the sidecar against the page URL rather than the script's
 * when it cannot tell them apart, which 404s as soon as the engine is served
 * from anywhere but the site root.
 */
export function slamLocateFile(baseUrl?: string): (path: string) => string {
  const base = resolveSlamBase(baseUrl);
  return (path: string) => (path.endsWith(".wasm") ? base + path : path);
}

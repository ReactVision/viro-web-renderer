/**
 * @reactvision/viro-web-renderer
 *
 * WebAssembly/WebGL2 build of the Viro renderer (virocore) for the web platform.
 */

export { ViroWebRenderer } from "./ViroWebRenderer.js";
export { loadViroWebModule } from "./loader.js";
export type {
  ViroWebModule,
  ViroWebModuleFactory,
  ViroWebRendererOptions,
  LocateFile,
} from "./types.js";

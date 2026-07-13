import type { ViroWebModule } from "./types.js";

/** Opaque handle to a native scene-graph object (node/geometry/material). 0 = invalid. */
export type ViroHandle = number;

export const VIRO_INVALID_HANDLE = 0;

/** Mirrors VROLightingModel in the renderer (VROMaterial.h). */
export enum ViroLightingModel {
  Constant = 0,
  Lambert = 1,
  Blinn = 2,
  Phong = 3,
  PhysicallyBased = 4,
}

/**
 * Typed, ergonomic facade over the WASM scene-graph C API. The TS bridge
 * reconciler drives these methods; handles are opaque ints owned by the WASM
 * module (see VROSceneWeb.cpp). Grouped by object kind for clarity.
 */
export class ViroSceneApi {
  constructor(private readonly m: ViroWebModule) {}

  // --- Nodes ---
  getRootNode(): ViroHandle {
    return this.m.viroGetRootNode();
  }
  createNode(): ViroHandle {
    return this.m.viroCreateNode();
  }
  setNodePosition(node: ViroHandle, x: number, y: number, z: number): void {
    this.m.viroSetNodePosition(node, x, y, z);
  }
  setNodeRotation(node: ViroHandle, x: number, y: number, z: number): void {
    this.m.viroSetNodeRotation(node, x, y, z);
  }
  setNodeScale(node: ViroHandle, x: number, y: number, z: number): void {
    this.m.viroSetNodeScale(node, x, y, z);
  }
  setNodeOpacity(node: ViroHandle, opacity: number): void {
    this.m.viroSetNodeOpacity(node, opacity);
  }
  setNodeVisible(node: ViroHandle, visible: boolean): void {
    this.m.viroSetNodeVisible(node, visible);
  }
  setNodeGeometry(node: ViroHandle, geometry: ViroHandle): void {
    this.m.viroSetNodeGeometry(node, geometry);
  }
  addChildNode(parent: ViroHandle, child: ViroHandle): void {
    this.m.viroAddChildNode(parent, child);
  }
  removeNodeFromParent(node: ViroHandle): void {
    this.m.viroRemoveNodeFromParent(node);
  }
  destroyNode(node: ViroHandle): void {
    this.m.viroDestroyNode(node);
  }

  // --- Geometries ---
  createBox(width: number, height: number, length: number): ViroHandle {
    return this.m.viroCreateBox(width, height, length);
  }
  createSphere(radius: number): ViroHandle {
    return this.m.viroCreateSphere(radius);
  }
  createSurface(width: number, height: number): ViroHandle {
    return this.m.viroCreateSurface(width, height);
  }
  setGeometryMaterial(geometry: ViroHandle, material: ViroHandle): void {
    this.m.viroSetGeometryMaterial(geometry, material);
  }
  destroyGeometry(geometry: ViroHandle): void {
    this.m.viroDestroyGeometry(geometry);
  }

  // --- Materials ---
  createMaterial(): ViroHandle {
    return this.m.viroCreateMaterial();
  }
  setMaterialDiffuseColor(
    material: ViroHandle,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    this.m.viroSetMaterialDiffuseColor(material, r, g, b, a);
  }
  setMaterialLightingModel(material: ViroHandle, model: ViroLightingModel): void {
    this.m.viroSetMaterialLightingModel(material, model);
  }
  destroyMaterial(material: ViroHandle): void {
    this.m.viroDestroyMaterial(material);
  }
}

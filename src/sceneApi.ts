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

/** Mirrors VROLightType (VROLight.h). */
export enum ViroLightType {
  Ambient = 0,
  Directional = 1,
  Omni = 2,
  Spot = 3,
}

/** Mirrors VROEventDelegate::EventAction (VROEventDelegate.h). */
export enum ViroEventAction {
  Hover = 1,
  Click = 2,
  Touch = 3,
}

/** Mirrors VROEventDelegate::ClickState. */
export enum ViroClickState {
  ClickDown = 1,
  ClickUp = 2,
  Clicked = 3,
}

/** Handlers a node registers for its events. position is world-space [x,y,z]. */
export interface ViroNodeEventHandlers {
  onClick?: (
    clickState: ViroClickState,
    source: number,
    position: [number, number, number],
  ) => void;
  onHover?: (
    isHovering: boolean,
    source: number,
    position: [number, number, number],
  ) => void;
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
  setNodeEventEnabled(node: ViroHandle, action: ViroEventAction, enabled: boolean): void {
    this.m.viroSetNodeEventEnabled(node, action, enabled);
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

  // --- Lights ---
  createLight(type: ViroLightType): ViroHandle {
    return this.m.viroCreateLight(type);
  }
  setLightColor(light: ViroHandle, r: number, g: number, b: number): void {
    this.m.viroSetLightColor(light, r, g, b);
  }
  setLightIntensity(light: ViroHandle, intensity: number): void {
    this.m.viroSetLightIntensity(light, intensity);
  }
  setLightTemperature(light: ViroHandle, temperature: number): void {
    this.m.viroSetLightTemperature(light, temperature);
  }
  setLightDirection(light: ViroHandle, x: number, y: number, z: number): void {
    this.m.viroSetLightDirection(light, x, y, z);
  }
  setLightPosition(light: ViroHandle, x: number, y: number, z: number): void {
    this.m.viroSetLightPosition(light, x, y, z);
  }
  setLightAttenuation(light: ViroHandle, start: number, end: number): void {
    this.m.viroSetLightAttenuation(light, start, end);
  }
  setLightSpotAngles(light: ViroHandle, inner: number, outer: number): void {
    this.m.viroSetLightSpotAngles(light, inner, outer);
  }
  setLightCastsShadow(light: ViroHandle, castsShadow: boolean): void {
    this.m.viroSetLightCastsShadow(light, castsShadow);
  }
  addLightToNode(node: ViroHandle, light: ViroHandle): void {
    this.m.viroAddLightToNode(node, light);
  }
  removeLightFromNode(node: ViroHandle, light: ViroHandle): void {
    this.m.viroRemoveLightFromNode(node, light);
  }
  destroyLight(light: ViroHandle): void {
    this.m.viroDestroyLight(light);
  }

  // --- Camera ---
  setNodeCamera(node: ViroHandle): void {
    this.m.viroSetNodeCamera(node);
  }
  setActiveCameraNode(node: ViroHandle): void {
    this.m.viroSetActiveCameraNode(node);
  }
}

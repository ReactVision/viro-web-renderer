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

/** Texture channel on a material (matches viroSetMaterialTexture in VROSceneWeb.cpp). */
export enum ViroTextureChannel {
  Diffuse = 0,
  Specular = 1,
  Normal = 2,
  Roughness = 3,
  Metalness = 4,
  AmbientOcclusion = 5,
}

/** Mirrors VROWrapMode (VROTexture.h). */
export enum ViroWrapMode {
  Clamp = 0,
  Repeat = 1,
  ClampToBorder = 2,
  Mirror = 3,
}

/** Mirrors VROFilterMode (VROTexture.h). */
export enum ViroFilterMode {
  None = 0,
  Nearest = 1,
  Linear = 2,
}

/** Mirrors VROCullMode (VROMaterial.h). */
export enum ViroCullMode {
  Back = 0,
  Front = 1,
  None = 2,
}

/** Mirrors VROBlendMode (VROMaterial.h) subset exposed to web. */
export enum ViroBlendMode {
  None = 0,
  Alpha = 1,
  Add = 2,
  Multiply = 3,
  Subtract = 4,
  Screen = 5,
}

/** Text horizontal alignment (mirrors VROTextHorizontalAlignment). */
export enum ViroTextHorizontalAlignment {
  Left = 0,
  Right = 1,
  Center = 2,
}
/** Text vertical alignment (mirrors VROTextVerticalAlignment). */
export enum ViroTextVerticalAlignment {
  Top = 0,
  Bottom = 1,
  Center = 2,
}
/** Line break mode (mirrors VROLineBreakMode). */
export enum ViroLineBreakMode {
  WordWrap = 0,
  CharWrap = 1,
  Justify = 2,
  None = 3,
}
/** Text clip mode (mirrors VROTextClipMode). */
export enum ViroTextClipMode {
  ClipToBounds = 0,
  None = 1,
}

/** AR tracking state (mirrors VROARTrackingState in VROARCamera.h). */
export enum ViroTrackingState {
  Unavailable = 1,
  Limited = 2,
  Normal = 3,
}

/** Easing for declarative animations (matches easingValue in VROSceneWeb.cpp). */
export enum ViroEasing {
  Linear = 0,
  EaseIn = 1,
  EaseOut = 2,
  EaseInEaseOut = 3,
  Bounce = 4,
  PowerDecel = 5,
}

/** Model container format for loadModel (matches viroLoadModel in VROSceneWeb.cpp). */
export enum ViroModelFormat {
  GLB = 0,
  GLTF = 1,
  VRX = 2,
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

/** Handlers for a node's model animation lifecycle. */
export interface ViroAnimationHandlers {
  onStart?: () => void;
  onFinish?: () => void;
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
  createText(
    text: string,
    width: number,
    height: number,
    fontSize: number,
    hAlign: ViroTextHorizontalAlignment,
    vAlign: ViroTextVerticalAlignment,
    lineBreak: ViroLineBreakMode,
    clipMode: ViroTextClipMode,
    maxLines: number,
    color: { r: number; g: number; b: number; a: number },
  ): ViroHandle {
    return this.m.viroCreateText(
      text,
      width,
      height,
      fontSize,
      hAlign,
      vAlign,
      lineBreak,
      clipMode,
      maxLines,
      color.r,
      color.g,
      color.b,
      color.a,
    );
  }
  /** points: flat [x,y,z, …]. */
  createPolyline(points: Float32Array | number[], thickness: number): ViroHandle {
    return this.m.viroCreatePolyline(points, thickness);
  }
  /** points: flat [x,y,z, …] perimeter. */
  createPolygon(points: Float32Array | number[]): ViroHandle {
    return this.m.viroCreatePolygon(points);
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
  setMaterialShininess(material: ViroHandle, shininess: number): void {
    this.m.viroSetMaterialShininess(material, shininess);
  }
  setMaterialFresnelExponent(material: ViroHandle, fresnel: number): void {
    this.m.viroSetMaterialFresnelExponent(material, fresnel);
  }
  setMaterialRoughness(material: ViroHandle, roughness: number): void {
    this.m.viroSetMaterialRoughness(material, roughness);
  }
  setMaterialMetalness(material: ViroHandle, metalness: number): void {
    this.m.viroSetMaterialMetalness(material, metalness);
  }
  setMaterialDiffuseIntensity(material: ViroHandle, intensity: number): void {
    this.m.viroSetMaterialDiffuseIntensity(material, intensity);
  }
  setMaterialCullMode(material: ViroHandle, mode: ViroCullMode): void {
    this.m.viroSetMaterialCullMode(material, mode);
  }
  setMaterialBlendMode(material: ViroHandle, mode: ViroBlendMode): void {
    this.m.viroSetMaterialBlendMode(material, mode);
  }
  setMaterialWritesToDepthBuffer(material: ViroHandle, writes: boolean): void {
    this.m.viroSetMaterialWritesToDepthBuffer(material, writes);
  }
  setMaterialReadsFromDepthBuffer(material: ViroHandle, reads: boolean): void {
    this.m.viroSetMaterialReadsFromDepthBuffer(material, reads);
  }
  destroyMaterial(material: ViroHandle): void {
    this.m.viroDestroyMaterial(material);
  }

  // --- Textures ---
  createTextureRGBA(
    pixels: Uint8Array | number[],
    width: number,
    height: number,
    sRGB: boolean,
  ): ViroHandle {
    return this.m.viroCreateTextureRGBA(pixels, width, height, sRGB);
  }
  setTextureWrap(texture: ViroHandle, wrapS: ViroWrapMode, wrapT: ViroWrapMode): void {
    this.m.viroSetTextureWrap(texture, wrapS, wrapT);
  }
  setTextureFilter(
    texture: ViroHandle,
    min: ViroFilterMode,
    mag: ViroFilterMode,
    mip: ViroFilterMode,
  ): void {
    this.m.viroSetTextureFilter(texture, min, mag, mip);
  }
  setMaterialTexture(material: ViroHandle, channel: ViroTextureChannel, texture: ViroHandle): void {
    this.m.viroSetMaterialTexture(material, channel, texture);
  }
  destroyTexture(texture: ViroHandle): void {
    this.m.viroDestroyTexture(texture);
  }

  // --- Background (skybox / 360) ---
  /** Six RGBA8 faces in +X,-X,+Y,-Y,+Z,-Z order, each width*height*4 bytes. */
  createTextureCubeRGBA(
    faces: {
      px: Uint8Array | number[];
      nx: Uint8Array | number[];
      py: Uint8Array | number[];
      ny: Uint8Array | number[];
      pz: Uint8Array | number[];
      nz: Uint8Array | number[];
    },
    width: number,
    height: number,
  ): ViroHandle {
    return this.m.viroCreateTextureCubeRGBA(
      faces.px,
      faces.nx,
      faces.py,
      faces.ny,
      faces.pz,
      faces.nz,
      width,
      height,
    );
  }
  setBackgroundSphere(texture: ViroHandle): void {
    this.m.viroSetBackgroundSphere(texture);
  }
  setBackgroundCube(texture: ViroHandle): void {
    this.m.viroSetBackgroundCube(texture);
  }
  setBackgroundRotation(x: number, y: number, z: number): void {
    this.m.viroSetBackgroundRotation(x, y, z);
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

  // --- Model animations ---
  getAnimationKeys(node: ViroHandle): string[] {
    return this.m.viroGetAnimationKeys(node);
  }
  startAnimation(node: ViroHandle, name: string, loop: boolean): void {
    this.m.viroStartAnimation(node, name, loop);
  }
  pauseAnimation(node: ViroHandle): void {
    this.m.viroPauseAnimation(node);
  }
  resumeAnimation(node: ViroHandle): void {
    this.m.viroResumeAnimation(node);
  }
  stopAnimation(node: ViroHandle, jumpToEnd = false): void {
    this.m.viroStopAnimation(node, jumpToEnd);
  }

  // --- Declarative animations (transform/opacity via transaction) ---
  beginAnimation(
    node: ViroHandle,
    durationSeconds: number,
    delaySeconds: number,
    loop: boolean,
    easing: ViroEasing,
  ): void {
    this.m.viroBeginAnimation(node, durationSeconds, delaySeconds, loop, easing);
  }
  commitAnimation(): void {
    this.m.viroCommitAnimation();
  }

  // --- AR ---
  initAR(): void {
    this.m.viroInitAR();
  }
  arSetPose(
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    px: number,
    py: number,
    pz: number,
    trackingState: ViroTrackingState,
  ): void {
    this.m.viroARSetPose(qx, qy, qz, qw, px, py, pz, trackingState);
  }
  arSetCameraBackground(texture: ViroHandle): void {
    this.m.viroARSetCameraBackground(texture);
  }
  arSetCameraImageSize(width: number, height: number): void {
    this.m.viroARSetCameraImageSize(width, height);
  }
}

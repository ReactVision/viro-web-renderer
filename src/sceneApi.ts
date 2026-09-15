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

/** Mirrors VROShaderEntryPoint (VROShaderModifier.h). Unknown strings fall back to "fragment". */
export type ViroShaderEntryPoint =
  | "geometry"
  | "vertex"
  | "surface"
  | "fragment"
  | "lightingModel"
  | "image";

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

/** Free axis for a billboard constraint (mirrors VROBillboardAxis). */
export enum ViroBillboardAxis {
  X = 0,
  Y = 1,
  Z = 2,
  All = 3,
}

/** Particle spawn-volume shape (mirrors VROParticleSpawnVolume::Shape). */
export enum ViroParticleSpawnShape {
  Box = 0,
  Sphere = 1,
  Point = 2,
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
  /** Needs its companion .mtl (and any textures it names) passed as resources. */
  OBJ = 3,
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
  /** Drawn-last wins among equal-depth fragments. Mirrors the native prop. */
  setNodeRenderingOrder(node: ViroHandle, order: number): void {
    if (typeof this.m.viroSetNodeRenderingOrder !== "function") return;
    this.m.viroSetNodeRenderingOrder(node, order);
  }
  /**
   * A light lights this node only where their masks intersect. `recursive`
   * matters for a loaded model, whose geometry is on children rather than on
   * the handle the caller owns.
   */
  setNodeLightReceivingBitMask(node: ViroHandle, mask: number, recursive = true): void {
    if (typeof this.m.viroSetNodeLightReceivingBitMask !== "function") return;
    this.m.viroSetNodeLightReceivingBitMask(node, mask, recursive);
  }
  setNodeShadowCastingBitMask(node: ViroHandle, mask: number, recursive = true): void {
    if (typeof this.m.viroSetNodeShadowCastingBitMask !== "function") return;
    this.m.viroSetNodeShadowCastingBitMask(node, mask, recursive);
  }
  /** Turn the node to face the camera about `axis`, or null to stop. */
  setNodeBillboard(node: ViroHandle, axis: ViroBillboardAxis | null): void {
    if (typeof this.m.viroSetNodeBillboard !== "function") return;
    this.m.viroSetNodeBillboard(node, axis ?? -1);
  }
  /**
   * The node's world position, or null on a binary that cannot report it.
   *
   * Null rather than the origin on purpose: a caller measuring a distance has to
   * be able to tell "at the origin" from "unknown", and treating the second as
   * the first fires proximity triggers that should not have fired.
   */
  getNodeWorldPosition(node: ViroHandle): [number, number, number] | null {
    if (typeof this.m.viroGetNodeWorldPosition !== "function") return null;
    const p = this.m.viroGetNodeWorldPosition(node);
    if (!p || p.length < 3) return null;
    return [p[0]!, p[1]!, p[2]!];
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
  /**
   * A surface whose texture is cropped to [u0,v0]-[u1,v1] rather than stretched
   * over the whole quad — what imageClipMode ClipToBounds does on a device.
   * Falls back to the uncropped surface on a binary without it, which is the
   * picture whole and the wrong size rather than no picture at all.
   */
  createSurfaceUV(
    width: number,
    height: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): ViroHandle {
    if (typeof this.m.viroCreateSurfaceUV !== "function") {
      return this.m.viroCreateSurface(width, height);
    }
    return this.m.viroCreateSurfaceUV(width, height, u0, v0, u1, v1);
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
  /** Custom mesh. normals/texcoords may be empty; indices are triangles. */
  createGeometry(
    vertices: Float32Array | number[],
    normals: Float32Array | number[],
    texcoords: Float32Array | number[],
    indices: Uint32Array | number[],
  ): ViroHandle {
    return this.m.viroCreateGeometry(vertices, normals, texcoords, indices);
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
  // shaderCode should already have any `uniforms` declarations prepended
  // (uniforms + "\n" + body) — the caller owns that concatenation, same as
  // MaterialManager.java::parseShaderModifiers on Android.
  addMaterialShaderModifier(
    material: ViroHandle,
    entryPoint: ViroShaderEntryPoint,
    shaderCode: string,
    varyings?: string[],
    requiresSceneDepth = false,
    requiresCameraTexture = false,
  ): void {
    this.m.viroAddMaterialShaderModifier(
      material,
      entryPoint,
      shaderCode,
      varyings,
      requiresSceneDepth,
      requiresCameraTexture,
    );
  }
  removeAllMaterialShaderModifiers(material: ViroHandle): void {
    this.m.viroRemoveAllMaterialShaderModifiers(material);
  }
  // Dynamic shader-uniform updates. The uniform must be declared in a
  // shaderModifier already applied to this material (addMaterialShaderModifier)
  // for these to have any visible effect — same rule as native.
  setMaterialShaderUniformFloat(material: ViroHandle, name: string, value: number): void {
    this.m.viroSetMaterialShaderUniformFloat(material, name, value);
  }
  setMaterialShaderUniformVec2(material: ViroHandle, name: string, x: number, y: number): void {
    this.m.viroSetMaterialShaderUniformVec2(material, name, x, y);
  }
  setMaterialShaderUniformVec3(material: ViroHandle, name: string, x: number, y: number, z: number): void {
    this.m.viroSetMaterialShaderUniformVec3(material, name, x, y, z);
  }
  setMaterialShaderUniformVec4(material: ViroHandle, name: string, x: number, y: number, z: number, w: number): void {
    this.m.viroSetMaterialShaderUniformVec4(material, name, x, y, z, w);
  }
  setMaterialShaderUniformMat4(material: ViroHandle, name: string, matrix: Float32Array | number[]): void {
    this.m.viroSetMaterialShaderUniformMat4(material, name, matrix);
  }
  setMaterialShaderUniformTexture(material: ViroHandle, name: string, texture: ViroHandle): void {
    this.m.viroSetMaterialShaderUniformTexture(material, name, texture);
  }
  /**
   * Merge `material` onto everything `node` draws, itself and its whole subtree.
   * The counterpart of the native bridges' `shaderOverrides` prop, with the same
   * merge: each drawn material keeps its own colours and textures and takes the
   * override's lighting model, shininess, blend mode, transparency mode, cull
   * mode and two depth flags, plus its shader modifiers and uniforms.
   *
   * For a loaded model rather than a geometry built here: `setGeometryMaterial`
   * needs a geometry handle, and a model's geometry belongs to the loader, not
   * to the caller. Re-applying is safe — each call merges onto the materials the
   * node had before the first override, not onto the previous merge.
   */
  applyShaderOverride(node: ViroHandle, material: ViroHandle): boolean {
    // The binary is a build output of another repo and is routinely older than
    // this file. Calling straight through would throw on a module that predates
    // the export and take the whole scene down over a material; returning false
    // leaves the model with its own materials, which is what it had anyway.
    if (typeof this.m.viroApplyShaderOverride !== "function") {
      return false;
    }
    this.m.viroApplyShaderOverride(node, material);
    return true;
  }
  destroyMaterial(material: ViroHandle): void {
    this.m.viroDestroyMaterial(material);
  }

  // --- Post-processing effects ---
  //
  // All four open on, and the choreographer degrades whatever the driver cannot
  // do. The native scene navigators expose the same four as props; a caller that
  // switches HDR and bloom off here is matching what a device is told to do,
  // which is the difference these exist to close.
  //
  // The return is the state after the call, not whether the call was understood:
  // asking for HDR where the driver has no float colour buffers leaves it off.
  // A binary that predates these reports false and stays as it was.
  setHDREnabled(enabled: boolean): boolean {
    if (typeof this.m.viroSetHDREnabled !== "function") return false;
    return this.m.viroSetHDREnabled(enabled);
  }
  setBloomEnabled(enabled: boolean): boolean {
    if (typeof this.m.viroSetBloomEnabled !== "function") return false;
    return this.m.viroSetBloomEnabled(enabled);
  }
  setPBREnabled(enabled: boolean): boolean {
    if (typeof this.m.viroSetPBREnabled !== "function") return false;
    return this.m.viroSetPBREnabled(enabled);
  }
  setShadowsEnabled(enabled: boolean): boolean {
    if (typeof this.m.viroSetShadowsEnabled !== "function") return false;
    return this.m.viroSetShadowsEnabled(enabled);
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

  // --- Lighting environment (IBL) ---
  /** Load a radiance .hdr already written to the FS at `path` → texture handle. */
  loadRadianceHDRTexture(path: string): ViroHandle {
    return this.m.viroLoadRadianceHDRTexture(path);
  }
  /** Apply an IBL environment texture (0 clears it). */
  setLightingEnvironment(texture: ViroHandle): void {
    this.m.viroSetLightingEnvironment(texture);
  }

  // --- Portals ---
  createPortalScene(): ViroHandle {
    return this.m.viroCreatePortalScene();
  }
  createPortalFrame(): ViroHandle {
    return this.m.viroCreatePortalFrame();
  }
  setPortalEntrance(portalScene: ViroHandle, frame: ViroHandle): void {
    this.m.viroSetPortalEntrance(portalScene, frame);
  }
  setPortalPassable(portalScene: ViroHandle, passable: boolean): void {
    this.m.viroSetPortalPassable(portalScene, passable);
  }

  // --- Particles ---
  createParticleEmitter(
    node: ViroHandle,
    texture: ViroHandle,
    config: {
      particleWidth?: number;
      particleHeight?: number;
      maxParticles?: number;
      emissionRatePerSecond?: [number, number];
      particleLifetime?: [number, number];
      spawnShape?: ViroParticleSpawnShape;
      spawnParams?: [number, number, number];
      velocityMin?: [number, number, number];
      velocityMax?: [number, number, number];
    },
  ): void {
    const [erMin, erMax] = config.emissionRatePerSecond ?? [10, 10];
    const [ltMin, ltMax] = config.particleLifetime ?? [2000, 2000];
    const [sp0, sp1, sp2] = config.spawnParams ?? [0, 0, 0];
    const [vnx, vny, vnz] = config.velocityMin ?? [0, 0, 0];
    const [vxx, vxy, vxz] = config.velocityMax ?? [0, 0, 0];
    this.m.viroCreateParticleEmitter(
      node,
      texture,
      config.particleWidth ?? 0.1,
      config.particleHeight ?? 0.1,
      config.maxParticles ?? 500,
      erMin,
      erMax,
      ltMin,
      ltMax,
      config.spawnShape ?? ViroParticleSpawnShape.Point,
      sp0,
      sp1,
      sp2,
      vnx,
      vny,
      vnz,
      vxx,
      vxy,
      vxz,
    );
  }
  /** Acceleration on a running emitter, as a [min, max] range like velocity. */
  setParticleAcceleration(
    node: ViroHandle,
    min: [number, number, number],
    max: [number, number, number],
  ): void {
    if (typeof this.m.viroSetParticleAcceleration !== "function") return;
    this.m.viroSetParticleAcceleration(node, min[0], min[1], min[2], max[0], max[1], max[2]);
  }
  setParticleEmitterRun(node: ViroHandle, run: boolean): void {
    this.m.viroSetParticleEmitterRun(node, run);
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
  /** Pairs with a node's lightReceivingBitMask: both must intersect to light it. */
  setLightInfluenceBitMask(light: ViroHandle, mask: number): void {
    if (typeof this.m.viroSetLightInfluenceBitMask !== "function") return;
    this.m.viroSetLightInfluenceBitMask(light, mask);
  }
  /**
   * Shadow tuning. `castsShadow` decides whether a light casts at all; these
   * decide whether the result is usable — too small a map or too low a bias is
   * the difference between a shadow and a field of acne.
   *
   * No orthographic position: the native navigators take one but VROLight has no
   * setter for it, so there is nowhere to forward it.
   */
  setLightShadowOpacity(light: ViroHandle, opacity: number): void {
    if (typeof this.m.viroSetLightShadowOpacity !== "function") return;
    this.m.viroSetLightShadowOpacity(light, opacity);
  }
  setLightShadowMapSize(light: ViroHandle, size: number): void {
    if (typeof this.m.viroSetLightShadowMapSize !== "function") return;
    this.m.viroSetLightShadowMapSize(light, size);
  }
  setLightShadowBias(light: ViroHandle, bias: number): void {
    if (typeof this.m.viroSetLightShadowBias !== "function") return;
    this.m.viroSetLightShadowBias(light, bias);
  }
  setLightShadowNearZ(light: ViroHandle, nearZ: number): void {
    if (typeof this.m.viroSetLightShadowNearZ !== "function") return;
    this.m.viroSetLightShadowNearZ(light, nearZ);
  }
  setLightShadowFarZ(light: ViroHandle, farZ: number): void {
    if (typeof this.m.viroSetLightShadowFarZ !== "function") return;
    this.m.viroSetLightShadowFarZ(light, farZ);
  }
  setLightShadowOrthographicSize(light: ViroHandle, size: number): void {
    if (typeof this.m.viroSetLightShadowOrthographicSize !== "function") return;
    this.m.viroSetLightShadowOrthographicSize(light, size);
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
  /**
   * Returns false when the loaded wasm predates orthographic support, so a
   * renderer built before it degrades to perspective instead of throwing on
   * every camera mount. Same reasoning as arSetCameraIntrinsics below.
   */
  setCameraProjection(node: ViroHandle, projection: "perspective" | "orthographic"): boolean {
    if (typeof this.m.viroSetCameraProjection !== "function") {
      return false;
    }
    this.m.viroSetCameraProjection(node, projection === "orthographic" ? 1 : 0);
    return true;
  }
  /** Full vertical height in world units; width follows the viewport aspect ratio. */
  setCameraOrthographicScale(node: ViroHandle, scale: number): boolean {
    if (typeof this.m.viroSetCameraOrthographicScale !== "function") {
      return false;
    }
    this.m.viroSetCameraOrthographicScale(node, scale);
    return true;
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
  /**
   * The camera's real intrinsics, which the projection frustum is built from.
   *
   * Prefer this over arSetCameraImageSize wherever the intrinsics are known.
   * With only the dimensions, virocore projects the scene through a fixed
   * 60-degree vertical field of view — the camera background is a screen-space
   * surface and fills the viewport regardless, so the feed looks right while the
   * 3-D content sits in the wrong place, slightly near the optical axis and
   * badly toward the edges.
   *
   * Returns false against a virocore build without the binding, so a caller can
   * tell "no intrinsics were used" from "intrinsics were applied".
   */
  arSetCameraIntrinsics(
    fx: number, fy: number, cx: number, cy: number,
    width: number, height: number,
  ): boolean {
    if (typeof this.m.viroARSetCameraIntrinsics !== "function") {
      this.m.viroARSetCameraImageSize(width, height);
      return false;
    }
    this.m.viroARSetCameraIntrinsics(fx, fy, cx, cy, width, height);
    return true;
  }
}

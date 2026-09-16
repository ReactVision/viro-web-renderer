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
  viroSetNodeRenderingOrder(node: number, order: number): void;
  viroSetNodeLightReceivingBitMask(node: number, mask: number, recursive: boolean): void;
  viroSetNodeShadowCastingBitMask(node: number, mask: number, recursive: boolean): void;
  // axis: 0 X, 1 Y, 2 Z, 3 all; anything else removes the constraint.
  viroSetNodeBillboard(node: number, axis: number): void;
  viroGetNodeWorldPosition(node: number): number[];

  viroCreateBox(width: number, height: number, length: number): number;
  viroCreateSphere(radius: number): number;
  viroCreateSurface(width: number, height: number): number;
  viroCreateSurfaceUV(
    width: number,
    height: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): number;
  viroCreateText(
    text: string,
    width: number,
    height: number,
    fontSize: number,
    hAlign: number,
    vAlign: number,
    lineBreak: number,
    clipMode: number,
    maxLines: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number;
  // Flat [x,y,z, …] point list.
  viroCreatePolyline(points: Float32Array | number[], thickness: number): number;
  viroCreatePolygon(points: Float32Array | number[]): number;
  // Custom mesh: flat vertex/normal [x,y,z,…], texcoord [u,v,…], triangle indices.
  viroCreateGeometry(
    vertices: Float32Array | number[],
    normals: Float32Array | number[],
    texcoords: Float32Array | number[],
    indices: Uint32Array | number[],
  ): number;
  viroSetGeometryMaterial(geometry: number, material: number): void;
  viroDestroyGeometry(geometry: number): void;

  viroCreateMaterial(): number;
  viroSetMaterialDiffuseColor(material: number, r: number, g: number, b: number, a: number): void;
  viroSetMaterialLightingModel(material: number, model: number): void;
  viroDestroyMaterial(material: number): void;
  viroSetMaterialShininess(material: number, shininess: number): void;
  viroSetMaterialFresnelExponent(material: number, fresnel: number): void;
  viroSetMaterialRoughness(material: number, roughness: number): void;
  viroSetMaterialMetalness(material: number, metalness: number): void;
  viroSetMaterialDiffuseIntensity(material: number, intensity: number): void;
  viroSetMaterialCullMode(material: number, mode: number): void;
  viroSetMaterialBlendMode(material: number, mode: number): void;
  viroSetMaterialWritesToDepthBuffer(material: number, writes: boolean): void;
  viroSetMaterialReadsFromDepthBuffer(material: number, reads: boolean): void;
  // shaderCode is the modifier body with any `uniforms` block already
  // prepended by the caller (uniforms + "\n" + body), matching the native
  // bridges' convention. varyings is optional; pass undefined for none.
  viroAddMaterialShaderModifier(
    material: number,
    entryPoint: string,
    shaderCode: string,
    varyings: string[] | undefined,
    requiresSceneDepth: boolean,
    requiresCameraTexture: boolean,
  ): void;
  viroRemoveAllMaterialShaderModifiers(material: number): void;
  // Dynamic shader-uniform updates (ViroMaterials.updateShaderUniform). Each
  // just stores the value on the material; the renderer re-pushes it to the
  // GL uniform of the same name every frame the material is bound — no
  // per-frame call needed here beyond the initial set. No vec2 variant: the
  // native bridges these mirror don't expose one either.
  viroSetMaterialShaderUniformFloat(material: number, name: string, value: number): void;
  viroSetMaterialShaderUniformVec2(material: number, name: string, x: number, y: number): void;
  viroSetMaterialShaderUniformVec3(material: number, name: string, x: number, y: number, z: number): void;
  viroSetMaterialShaderUniformVec4(material: number, name: string, x: number, y: number, z: number, w: number): void;
  // matrix must have exactly 16 elements.
  viroSetMaterialShaderUniformMat4(material: number, name: string, matrix: Float32Array | number[]): void;
  // texture may be VIRO_INVALID_HANDLE (0) to clear it.
  viroSetMaterialShaderUniformTexture(material: number, name: string, texture: number): void;
  // Merges a material onto everything `node` and its subtree draw.
  viroApplyShaderOverride(node: number, material: number): void;

  // Post-processing effects. Each returns whether the effect is on afterwards.
  viroSetHDREnabled(enabled: boolean): boolean;
  viroSetBloomEnabled(enabled: boolean): boolean;
  viroSetPBREnabled(enabled: boolean): boolean;
  viroSetShadowsEnabled(enabled: boolean): boolean;
  // The tone curve on its own, so a caller can drop Hable without dropping PBR.
  viroSetToneMappingEnabled(enabled: boolean): void;

  // Physics. Bullet is compiled into the binary; these are the only way in.
  viroSetPhysicsWorld(enabled: boolean, gx: number, gy: number, gz: number): void;
  viroSetPhysicsBody(
    node: number,
    type: number,
    mass: number,
    shapeType: number,
    shapeParams: number[],
    tag: string,
  ): void;
  viroSetPhysicsBodyProperties(
    node: number,
    restitution: number,
    friction: number,
    useGravity: boolean,
  ): void;
  viroSetPhysicsVelocity(node: number, x: number, y: number, z: number, isConstant: boolean): void;
  viroApplyPhysicsImpulse(node: number, x: number, y: number, z: number): void;
  viroApplyPhysicsTorque(node: number, x: number, y: number, z: number): void;
  viroClearPhysicsBody(node: number): void;
  viroSetCollisionCallback(
    cb: (
      tagA: string, tagB: string,
      px: number, py: number, pz: number,
      nx: number, ny: number, nz: number,
    ) => void,
  ): void;

  // Textures. pixels is an RGBA8 buffer (width*height*4 bytes).
  viroCreateTextureRGBA(
    pixels: Uint8Array | number[],
    width: number,
    height: number,
    sRGB: boolean,
  ): number;
  viroSetTextureWrap(texture: number, wrapS: number, wrapT: number): void;
  viroSetTextureFilter(texture: number, min: number, mag: number, mip: number): void;
  viroSetMaterialTexture(material: number, channel: number, texture: number): void;
  viroDestroyTexture(texture: number): void;
  // Cube texture from six RGBA8 faces (+X,-X,+Y,-Y,+Z,-Z). For skyboxes.
  viroCreateTextureCubeRGBA(
    px: Uint8Array | number[],
    nx: Uint8Array | number[],
    py: Uint8Array | number[],
    ny: Uint8Array | number[],
    pz: Uint8Array | number[],
    nz: Uint8Array | number[],
    width: number,
    height: number,
  ): number;
  // IBL: load a radiance .hdr (written to the FS) → texture; apply to the scene.
  viroLoadRadianceHDRTexture(path: string): number;
  viroSetLightingEnvironment(texture: number): void;

  // Scene background: textured sphere (equirect 360) / cube (skybox) / rotation.
  viroSetBackgroundSphere(texture: number): void;
  viroSetBackgroundCube(texture: number): void;
  viroSetBackgroundRotation(x: number, y: number, z: number): void;

  // Particle emitter attached to a node. spawnShape: 0 Box, 1 Sphere, 2 Point.
  // Portals: a portal scene (VROPortal) + entrance frame (VROPortalFrame).
  viroCreatePortalScene(): number;
  viroCreatePortalFrame(): number;
  viroSetPortalEntrance(portalScene: number, frame: number): void;
  viroSetPortalPassable(portalScene: number, passable: boolean): void;

  viroCreateParticleEmitter(
    node: number,
    texture: number,
    particleW: number,
    particleH: number,
    maxParticles: number,
    emitRateMin: number,
    emitRateMax: number,
    lifetimeMin: number,
    lifetimeMax: number,
    spawnShape: number,
    sp0: number,
    sp1: number,
    sp2: number,
    velMinX: number,
    velMinY: number,
    velMinZ: number,
    velMaxX: number,
    velMaxY: number,
    velMaxZ: number,
  ): number;
  viroSetParticleEmitterRun(node: number, run: boolean): void;
  viroSetParticleAcceleration(
    node: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  ): void;

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

  // Lights. type: 0=Ambient, 1=Directional, 2=Omni, 3=Spot.
  viroCreateLight(type: number): number;
  viroSetLightColor(light: number, r: number, g: number, b: number): void;
  viroSetLightIntensity(light: number, intensity: number): void;
  viroSetLightTemperature(light: number, temperature: number): void;
  viroSetLightDirection(light: number, x: number, y: number, z: number): void;
  viroSetLightPosition(light: number, x: number, y: number, z: number): void;
  viroSetLightAttenuation(light: number, start: number, end: number): void;
  viroSetLightSpotAngles(light: number, inner: number, outer: number): void;
  viroSetLightCastsShadow(light: number, castsShadow: boolean): void;
  viroSetLightInfluenceBitMask(light: number, mask: number): void;
  viroSetLightShadowOpacity(light: number, opacity: number): void;
  viroSetLightShadowMapSize(light: number, size: number): void;
  viroSetLightShadowBias(light: number, bias: number): void;
  viroSetLightShadowNearZ(light: number, nearZ: number): void;
  viroSetLightShadowFarZ(light: number, farZ: number): void;
  viroSetLightShadowOrthographicSize(light: number, size: number): void;
  viroAddLightToNode(node: number, light: number): void;
  viroRemoveLightFromNode(node: number, light: number): void;
  viroDestroyLight(light: number): void;

  // Camera.
  viroSetNodeCamera(node: number): void;
  viroSetActiveCameraNode(node: number): void;
  /**
   * projection: 0=perspective, 1=orthographic. Optional because a wasm built
   * before orthographic support simply will not export these.
   */
  viroSetCameraProjection?(node: number, projection: number): void;
  viroSetCameraOrthographicScale?(node: number, scale: number): void;

  // Model loading. The bridge writes the file to FS then calls viroLoadModel.
  // format: 0=GLB, 1=glTF, 2=VRX. Callback: (nodeHandle, success).
  viroSetModelLoadCallback(callback: (nodeHandle: number, success: boolean) => void): void;
  viroLoadModel(nodeHandle: number, path: string, format: number): void;

  // Model animations. Callback: (nodeHandle, eventType) 0=start, 1=finish.
  viroSetAnimationCallback(callback: (nodeHandle: number, eventType: number) => void): void;
  viroGetAnimationKeys(nodeHandle: number): string[];
  viroStartAnimation(nodeHandle: number, name: string, loop: boolean): void;
  viroPauseAnimation(nodeHandle: number): void;
  viroResumeAnimation(nodeHandle: number): void;
  viroStopAnimation(nodeHandle: number, jumpToEnd: boolean): void;

  // Declarative animations (transform/opacity via transaction): wrap node
  // property setters between begin/commit. easing: 0=Linear..5=PowerDecel.
  viroBeginAnimation(
    nodeHandle: number,
    duration: number,
    delay: number,
    loop: boolean,
    easing: number,
  ): void;
  viroCommitAnimation(): void;

  // --- AR (web). Pose/camera-feed are injected from JS running slam-wasm. ---
  // Switch the scene into AR mode; drawFrame() then drives the camera from the pose.
  viroInitAR(): void;
  // Inject a pose already converted to virocore's Y-up/GL convention. Rotation as
  // a quaternion (x,y,z,w); position in meters. trackingState: 1=Unavailable,
  // 2=Limited, 3=Normal.
  viroARSetPose(
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    px: number,
    py: number,
    pz: number,
    trackingState: number,
  ): void;
  // Set the live camera-feed texture handle (from viroCreateTextureRGBA).
  viroARSetCameraBackground(textureHandle: number): void;
  // Report the camera image dimensions (used for projection).
  viroARSetCameraImageSize(width: number, height: number): void;
  // Report the camera's real intrinsics, which the projection is built from.
  // Optional: builds of virocore predating it fall back to a fixed 60-degree
  // vertical field of view.
  viroARSetCameraIntrinsics?(
    fx: number, fy: number, cx: number, cy: number,
    width: number, height: number,
  ): void;

  // Emscripten virtual filesystem (exported via EXPORTED_RUNTIME_METHODS=[...,FS]).
  FS: {
    writeFile(path: string, data: Uint8Array | string): void;
    mkdirTree?(path: string): void;
    mkdir?(path: string): void;
    unlink?(path: string): void;
  };

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

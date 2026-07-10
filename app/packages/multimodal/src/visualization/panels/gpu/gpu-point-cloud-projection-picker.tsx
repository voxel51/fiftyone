import { useThree } from "@react-three/fiber";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import {
  acquireGpuPickReadbackPool,
  type GpuPickReadbackLease,
} from "./gpu-pick-readback-pool";
import {
  GpuPickRenderTarget,
  isGpuPickRenderer,
  type GpuPickRenderer,
} from "./gpu-pick-render-target";

const MIN_PROJECTABLE_DEPTH = 1e-6;
const CULLED_POSITION = 1e9;

// Projection picking is a reduction performed by rasterization:
//
//   sampled sensor point -> calibration pixel -> pointer-relative sprite
//   -> depth test by squared pixel distance -> one RGBA32Uint identity texel
//
// No projected UV array is materialized. The pass reads the same prepared
// point/source-index buffers as the visible camera layers.

interface PickNode {
  readonly w: PickNode;
  readonly x: PickNode;
  readonly y: PickNode;
  readonly z: PickNode;
  add(value: PickNode | number): PickNode;
  div(value: PickNode | number): PickNode;
  mul(value: PickNode | number): PickNode;
  sub(value: PickNode | number): PickNode;
}

interface PickUniformNode<T> extends PickNode {
  value: T;
}

interface PickPointsMaterial extends PointsNodeMaterial {
  depthNode: TSL.Node | null;
  fragmentNode: TSL.Node | null;
  scaleNode: PickNode | null;
}

// The installed Three runtime exposes these WebGPU/TSL APIs, while its pinned
// declaration surface intentionally covers only the nodes used by live panels.
const pickTsl = TSL as unknown as {
  and(...conditions: readonly PickNode[]): PickNode;
  clamp(value: PickNode, min: number, max: number): PickNode;
  greaterThan(left: PickNode, right: PickNode | number): PickNode;
  greaterThanEqual(left: PickNode, right: PickNode | number): PickNode;
  instanceIndex: PickNode;
  lessThan(left: PickNode, right: PickNode | number): PickNode;
  lessThanEqual(left: PickNode, right: PickNode | number): PickNode;
  select(
    condition: PickNode,
    whenTrue: PickNode,
    whenFalse: PickNode,
  ): PickNode;
  uint(value: PickNode | number): PickNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector2>(
    value: T,
  ): PickUniformNode<T>;
  uvec4(...values: readonly (PickNode | number)[]): PickNode;
  vec2(...values: readonly (PickNode | number)[]): PickNode;
  vec3(...values: readonly (PickNode | number)[]): PickNode;
  vec4(...values: readonly (PickNode | number)[]): PickNode;
};

/** GPU buffers and transform needed to pick one projected cloud layer. */
export interface GpuPointCloudProjectionPickLayer {
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  readonly projectionMatrix: THREE.Matrix4;
  readonly resourceKey: string;
  readonly sampledPointCount: number;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
}

/** Current camera calibration and layers visible to the projection picker. */
export interface GpuPointCloudProjectionPickerScene {
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  readonly layers: readonly GpuPointCloudProjectionPickLayer[];
}

/** Image-space dwell target and hit radius for a projection pick. */
export interface GpuPointCloudProjectionPickRequest {
  readonly radiusPx: number;
  readonly targetU: number;
  readonly targetV: number;
}

/** Winning projected point returned by the GPU pick pass. */
export interface GpuPointCloudProjectionPickResult {
  /** Original index in the picker scene's layer array. */
  readonly layerIndex: number;
  readonly resourceKey: string;
  /** Index in the prepared sampled arrays, before sourceIndices remapping. */
  readonly sampleIndex: number;
  /** Decoded point index written directly from the GPU source-index buffer. */
  readonly sourceIndex: number;
}

/** Imperative projection-picking API exposed to image overlays. */
export interface GpuPointCloudProjectionPickerHandle {
  /** Cancels any pending readback without destroying reusable GPU state. */
  invalidate(): void;
  pick(
    request: GpuPointCloudProjectionPickRequest,
  ): Promise<GpuPointCloudProjectionPickResult | null>;
}

/** Stateful picker handle with scene updates and explicit disposal. */
export interface GpuPointCloudProjectionPickerController extends GpuPointCloudProjectionPickerHandle {
  dispose(): void;
  setScene(scene: GpuPointCloudProjectionPickerScene): void;
}

/** React props accepted by the projection-picker bridge. */
export type GpuPointCloudProjectionPickerProps =
  GpuPointCloudProjectionPickerScene;

/**
 * Ref-only R3F bridge for the on-demand projection picker. It contributes no
 * object to the live image scene; each dwell renders a private 1x1 pass using
 * the current WebGPU renderer and asynchronously reads one integer texel.
 */
export const GpuPointCloudProjectionPicker = forwardRef<
  GpuPointCloudProjectionPickerHandle,
  GpuPointCloudProjectionPickerProps
>(function GpuPointCloudProjectionPicker(
  { calibrationHeight, calibrationWidth, layers },
  forwardedRef,
) {
  const gl = useThree((state) => state.gl);
  const controllerRef = useRef<GpuPointCloudProjectionPickerController | null>(
    null,
  );
  const handle = useMemo<GpuPointCloudProjectionPickerHandle>(
    () => ({
      invalidate: () => controllerRef.current?.invalidate(),
      pick: (request) =>
        controllerRef.current?.pick(request) ?? Promise.resolve(null),
    }),
    [],
  );

  useLayoutEffect(() => {
    const controller = createGpuPointCloudProjectionPickerController(gl);
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller.dispose();
    };
  }, [gl]);

  useLayoutEffect(() => {
    controllerRef.current?.setScene({
      calibrationHeight,
      calibrationWidth,
      layers,
    });
  }, [calibrationHeight, calibrationWidth, layers]);

  useImperativeHandle(forwardedRef, () => handle, [handle]);

  return null;
});

/** Creates the imperative picker used by the R3F bridge and unit tests. */
export function createGpuPointCloudProjectionPickerController(
  renderer: unknown,
): GpuPointCloudProjectionPickerController {
  if (!isGpuPickRenderer(renderer)) {
    throw new Error("GPU projection picking requires Three WebGPURenderer");
  }
  return new ProjectionPickerController(renderer);
}

class ProjectionPickerController implements GpuPointCloudProjectionPickerController {
  private disposed = false;
  private generation = 0;
  private readonly readback: GpuPickReadbackLease;
  private renderPass: ProjectionPickPass | null = null;
  private readonly target: GpuPickRenderTarget;

  constructor(renderer: GpuPickRenderer) {
    this.readback = acquireGpuPickReadbackPool(renderer);
    this.target = new GpuPickRenderTarget(renderer);
  }

  setScene(scene: GpuPointCloudProjectionPickerScene): void {
    if (this.disposed) {
      return;
    }
    this.invalidate();
    // Preserve compiled node materials while only matrices, counts, or frame
    // identities change. A buffer-identity/calibration-shape change rebuilds
    // the pass because TSL storage attributes are part of shader topology.
    if (this.renderPass?.updateScene(scene)) {
      return;
    }
    const previousPass = this.renderPass;
    this.renderPass = null;
    try {
      this.renderPass = createProjectionPickPass(scene);
    } finally {
      previousPass?.dispose();
    }
  }

  invalidate(): void {
    // GPU readback is asynchronous. Callers invalidate on pointer, frame, TF,
    // calibration, or lifecycle changes so an older texel cannot publish a
    // hover against newer scene state.
    this.generation += 1;
  }

  async pick(
    request: GpuPointCloudProjectionPickRequest,
  ): Promise<GpuPointCloudProjectionPickResult | null> {
    // A new request supersedes any previous request from this controller.
    const generation = ++this.generation;
    const renderPass = this.renderPass;
    if (
      this.disposed ||
      !renderPass ||
      !validPickRequest(request) ||
      !renderPass.hasValidCalibration
    ) {
      return null;
    }
    if (renderPass.layers.length === 0) {
      return null;
    }
    renderPass.updateRequest(request);

    let readback: Promise<ArrayBufferView>;
    try {
      readback = this.target.renderAndRead(
        renderPass.scene,
        PICK_CAMERA,
        this.readback,
      );
    } catch (error) {
      if (generation !== this.generation || this.disposed) {
        return null;
      }
      throw error;
    }

    let pixels: ArrayBufferView;
    try {
      pixels = await readback;
    } catch (error) {
      if (generation !== this.generation || this.disposed) {
        return null;
      }
      throw error;
    }

    if (generation !== this.generation || this.disposed) {
      return null;
    }
    if (!(pixels instanceof Uint32Array) || pixels.length < 3) {
      throw new Error("GPU projection picker returned a non-integer texel");
    }

    // Zero is the cleared target/no-hit sentinel. Valid zero-based indices are
    // stored as index + 1 so every channel can use the same sentinel.
    const encodedLayerIndex = pixels[0];
    const encodedSourceIndex = pixels[1];
    const encodedSampleIndex = pixels[2];
    if (
      encodedLayerIndex === 0 ||
      encodedSourceIndex === 0 ||
      encodedSampleIndex === 0
    ) {
      return null;
    }
    const activeLayerIndex = encodedLayerIndex - 1;
    const layer = renderPass.layers[activeLayerIndex];
    const sampleIndex = encodedSampleIndex - 1;
    if (!layer || sampleIndex >= layer.sampledPointCount) {
      return null;
    }

    return {
      layerIndex: layer.layerIndex,
      resourceKey: layer.resourceKey,
      sampleIndex,
      sourceIndex: encodedSourceIndex - 1,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
    this.renderPass?.dispose();
    this.renderPass = null;
    this.target.dispose();
    this.readback.release();
  }
}

interface ActivePickLayer {
  layerIndex: number;
  resourceKey: string;
  sampledPointCount: number;
}

interface PickLayerBinding {
  readonly matrix: PickUniformNode<THREE.Matrix4>;
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
  readonly sprite: THREE.Sprite;
}

interface ProjectionPickPass {
  readonly dispose: () => void;
  readonly hasValidCalibration: boolean;
  readonly layers: readonly ActivePickLayer[];
  readonly scene: THREE.Scene;
  readonly updateRequest: (request: GpuPointCloudProjectionPickRequest) => void;
  readonly updateScene: (scene: GpuPointCloudProjectionPickerScene) => boolean;
}

function createProjectionPickPass(
  sceneConfig: GpuPointCloudProjectionPickerScene,
): ProjectionPickPass {
  const scene = new THREE.Scene();
  const materials: PointsNodeMaterial[] = [];
  const layers: ActivePickLayer[] = [];
  const bindings: PickLayerBinding[] = [];
  const target = pickTsl.uniform(new THREE.Vector2());
  const radius = pickTsl.uniform<number>(1);

  const dispose = () => {
    for (const material of materials) {
      material.dispose();
    }
  };

  try {
    // One Sprite draw per cloud layer. Sprite.count drives instancing; the
    // custom node material ignores Sprite transforms and fetches positions by
    // instanceIndex from the shared storage attributes.
    for (const {
      layer,
      layerIndex,
      sampledPointCount,
    } of activeProjectionPickLayers(sceneConfig)) {
      const activeLayerIndex = layers.length;
      const binding = createProjectionPickMaterialNode({
        activeLayerIndex,
        calibrationHeight: sceneConfig.calibrationHeight,
        calibrationWidth: sceneConfig.calibrationWidth,
        positionAttribute: layer.positionAttribute,
        projectionMatrix: layer.projectionMatrix,
        radius,
        sourceIndexAttribute: layer.sourceIndexAttribute,
        target,
      });
      const points = new THREE.Sprite(
        binding.material as unknown as THREE.SpriteMaterial,
      );
      points.count = sampledPointCount;
      points.frustumCulled = false;
      scene.add(points);
      materials.push(binding.material);
      bindings.push({
        matrix: binding.matrix,
        positionAttribute: layer.positionAttribute,
        sourceIndexAttribute: layer.sourceIndexAttribute,
        sprite: points,
      });
      layers.push({
        layerIndex,
        resourceKey: layer.resourceKey,
        sampledPointCount,
      });
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    dispose,
    hasValidCalibration:
      sceneConfig.calibrationWidth > 0 && sceneConfig.calibrationHeight > 0,
    layers,
    scene,
    updateRequest: (request) => {
      target.value.set(request.targetU, request.targetV);
      radius.value = request.radiusPx;
    },
    updateScene: (nextScene) => {
      // Uniform values and instance counts are cheap to mutate. Attribute
      // identity is not: it is captured by the compiled TSL graph.
      if (
        nextScene.calibrationWidth !== sceneConfig.calibrationWidth ||
        nextScene.calibrationHeight !== sceneConfig.calibrationHeight
      ) {
        return false;
      }
      const active = activeProjectionPickLayers(nextScene);
      if (
        active.length !== bindings.length ||
        active.some(
          ({ layer }, index) =>
            layer.positionAttribute !== bindings[index].positionAttribute ||
            layer.sourceIndexAttribute !== bindings[index].sourceIndexAttribute,
        )
      ) {
        return false;
      }
      for (let index = 0; index < active.length; index++) {
        const { layer, layerIndex, sampledPointCount } = active[index];
        bindings[index].matrix.value.copy(layer.projectionMatrix);
        bindings[index].sprite.count = sampledPointCount;
        layers[index].layerIndex = layerIndex;
        layers[index].resourceKey = layer.resourceKey;
        layers[index].sampledPointCount = sampledPointCount;
      }
      return true;
    },
  };
}

/** Builds the integer-output material for one projected-point pick layer. */
export function createProjectionPickMaterial({
  activeLayerIndex,
  calibrationHeight,
  calibrationWidth,
  positionAttribute,
  projectionMatrix,
  request,
  sourceIndexAttribute,
}: {
  readonly activeLayerIndex: number;
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  readonly projectionMatrix: THREE.Matrix4;
  readonly request: GpuPointCloudProjectionPickRequest;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
}): PickPointsMaterial {
  const target = pickTsl.uniform(
    new THREE.Vector2(request.targetU, request.targetV),
  );
  const radius = pickTsl.uniform(request.radiusPx);
  return createProjectionPickMaterialNode({
    activeLayerIndex,
    calibrationHeight,
    calibrationWidth,
    positionAttribute,
    projectionMatrix,
    radius,
    sourceIndexAttribute,
    target,
  }).material;
}

interface ProjectionPickMaterialBinding {
  readonly material: PickPointsMaterial;
  readonly matrix: PickUniformNode<THREE.Matrix4>;
}

function createProjectionPickMaterialNode({
  activeLayerIndex,
  calibrationHeight,
  calibrationWidth,
  positionAttribute,
  projectionMatrix,
  radius,
  sourceIndexAttribute,
  target,
}: {
  readonly activeLayerIndex: number;
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  readonly projectionMatrix: THREE.Matrix4;
  readonly radius: PickUniformNode<number>;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
  readonly target: PickUniformNode<THREE.Vector2>;
}): ProjectionPickMaterialBinding {
  const material = new PointsNodeMaterial({
    size: 1,
    sizeAttenuation: false,
  }) as PickPointsMaterial;
  material.alphaToCoverage = false;
  material.blending = THREE.NoBlending;
  material.depthFunc = THREE.LessEqualDepth;
  material.depthTest = true;
  material.depthWrite = true;
  material.fog = false;
  material.toneMapped = false;

  const matrix = pickTsl.uniform(projectionMatrix.clone());
  const dimensions = pickTsl.uniform(
    new THREE.Vector2(calibrationWidth, calibrationHeight),
  );
  const radiusSq = radius.mul(radius);
  const sensorPosition = TSL.instancedBufferAttribute(
    positionAttribute,
    "vec3",
  ) as unknown as PickNode;
  const sourceIndex = TSL.instancedBufferAttribute(
    sourceIndexAttribute,
    "uint",
  ) as unknown as PickNode;
  const homogeneous = matrix.mul(pickTsl.vec4(sensorPosition, 1));
  // The matrix yields [u*z, v*z, z, 1]. Divide by camera depth to recover
  // calibration-pixel coordinates without writing an intermediate UV buffer.
  const cameraDepth = homogeneous.z;
  const u = homogeneous.x.div(cameraDepth);
  const v = homogeneous.y.div(cameraDepth);
  const du = u.sub(target.x);
  const dv = v.sub(target.y);
  const distanceSq = du.mul(du).add(dv.mul(dv));
  const visible = pickTsl.and(
    pickTsl.greaterThan(cameraDepth, MIN_PROJECTABLE_DEPTH),
    pickTsl.greaterThanEqual(u, 0),
    pickTsl.greaterThanEqual(v, 0),
    pickTsl.lessThan(u, dimensions.x),
    pickTsl.lessThan(v, dimensions.y),
    pickTsl.lessThanEqual(distanceSq, radiusSq),
  );
  // Recenter every candidate around the 1x1 pick camera. Points outside the
  // radius are moved beyond clip space and scaled to zero; candidates inside
  // it cover the texel and compete via depth below.
  const pickPosition = pickTsl.vec3(du.div(radius), dv.div(radius).mul(-1), 0);
  material.positionNode = pickTsl.select(
    visible,
    pickPosition,
    pickTsl.vec3(CULLED_POSITION, CULLED_POSITION, 0),
  ) as unknown as TSL.Node;
  material.scaleNode = pickTsl.select(
    visible,
    pickTsl.vec2(1, 1),
    pickTsl.vec2(0, 0),
  );
  // Normalized squared screen distance makes the closest projected center win
  // independent of sensor depth, matching the original 2D hover semantics.
  material.depthNode = pickTsl.clamp(
    distanceSq.div(radiusSq),
    0,
    1,
  ) as unknown as TSL.Node;
  // RGBA32Uint payload: active-layer, decoded-source, sampled-array, marker.
  // Every identity is +1 encoded because target clear writes all zeros.
  material.fragmentNode = pickTsl.uvec4(
    pickTsl.uint(activeLayerIndex + 1),
    sourceIndex.add(1),
    pickTsl.instanceIndex.add(1),
    pickTsl.uint(1),
  ) as unknown as TSL.Node;

  return { material, matrix };
}

function activeProjectionPickLayers(
  scene: GpuPointCloudProjectionPickerScene,
): Array<{
  readonly layer: GpuPointCloudProjectionPickLayer;
  readonly layerIndex: number;
  readonly sampledPointCount: number;
}> {
  const active = [];
  for (const [layerIndex, layer] of scene.layers.entries()) {
    if (layer.positionAttribute.itemSize !== 3) {
      throw new Error(
        "GPU projection picker positions must be vec3 attributes",
      );
    }
    if (layer.sourceIndexAttribute.itemSize !== 1) {
      throw new Error("GPU projection picker source indices must be scalars");
    }
    // Trust only the intersection of declared samples and actual buffer
    // lengths. This prevents an inconsistent transferred payload from letting
    // instanceIndex read past either storage attribute.
    const sampledPointCount = Math.min(
      layer.positionAttribute.count,
      layer.sourceIndexAttribute.count,
      Math.max(0, Math.floor(layer.sampledPointCount)),
    );
    if (sampledPointCount > 0) {
      active.push({ layer, layerIndex, sampledPointCount });
    }
  }
  return active;
}

function validPickRequest({
  radiusPx,
  targetU,
  targetV,
}: GpuPointCloudProjectionPickRequest): boolean {
  return (
    Number.isFinite(radiusPx) &&
    radiusPx > 0 &&
    Number.isFinite(targetU) &&
    Number.isFinite(targetV)
  );
}

// The pick material emits pointer-relative clip-space positions directly, so
// this camera is intentionally fixed and carries no scene semantics.
const PICK_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
PICK_CAMERA.position.set(0, 0, 1);
PICK_CAMERA.updateProjectionMatrix();

export default GpuPointCloudProjectionPicker;

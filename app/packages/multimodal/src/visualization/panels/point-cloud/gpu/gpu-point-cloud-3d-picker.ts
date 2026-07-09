import { createContext } from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import {
  acquireGpuPickReadbackPool,
  type GpuPickReadbackLease,
} from "../../gpu/gpu-pick-readback-pool";
import {
  GpuPickRenderTarget,
  isGpuPickRenderer,
  type GpuPickRenderer,
} from "../../gpu/gpu-pick-render-target";
import {
  gpuPointCloudPositionNode,
  gpuPointCloudSampleIndexFromStrideNode,
  gpuPointCloudSampleIndexNode,
  type GpuPointCloudNode,
  type GpuPointCloudPositionLayout,
} from "./gpu-point-cloud-position-nodes";

const CULLED_POSITION = 1e9;
const MAX_PICK_DISTANCE = 1e30;
const MIN_CLIP_W = 1e-6;

interface PickNode extends TSL.Node {
  readonly w: PickNode;
  readonly x: PickNode;
  readonly xy: PickNode;
  readonly xyz: PickNode;
  readonly y: PickNode;
  readonly z: PickNode;
  add(value: PickNode | number): PickNode;
  div(value: PickNode | number): PickNode;
  dot(value: PickNode): PickNode;
  mul(value: PickNode | number): PickNode;
  sub(value: PickNode | number): PickNode;
}

interface PickUniformNode<T> extends PickNode {
  value: T;
}

type PickSampleIndexNode = GpuPointCloudNode & PickNode;

interface PickPointsMaterial extends PointsNodeMaterial {
  depthNode: TSL.Node | null;
  fragmentNode: TSL.Node | null;
  scaleNode: PickNode | null;
}

// Three r185 ships these WebGPU/TSL nodes at runtime, while Fiber's bundled
// declarations expose only a subset of them.
const pickTsl = TSL as unknown as {
  and(...conditions: readonly PickNode[]): PickNode;
  clamp(value: PickNode, min: number, max: number): PickNode;
  greaterThan(left: PickNode, right: PickNode | number): PickNode;
  greaterThanEqual(left: PickNode, right: PickNode | number): PickNode;
  lessThanEqual(left: PickNode, right: PickNode | number): PickNode;
  select(
    condition: PickNode,
    whenTrue: PickNode,
    whenFalse: PickNode,
  ): PickNode;
  uint(value: PickNode | number): PickNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector2 | THREE.Vector3>(
    value: T,
  ): PickUniformNode<T>;
  uvec4(...values: readonly (PickNode | number)[]): PickNode;
  vec2(...values: readonly (PickNode | number)[]): PickNode;
  vec3(...values: readonly (PickNode | number)[]): PickNode;
  vec4(...values: readonly (PickNode | number)[]): PickNode;
};

/** One live 3D cloud sharing its exact position buffer with the GPU picker. */
export interface GpuPointCloud3dPickLayer {
  readonly colorAttribute: THREE.BufferAttribute | null;
  readonly layerId: string;
  readonly object: THREE.Object3D;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly positionLayout: GpuPointCloudPositionLayout;
  renderedPointCount: number;
  resourceKey: string;
  sampledPointCount: number;
}

/** Canvas-local registry of live point-cloud layers available for picking. */
export interface GpuPointCloud3dPickerRegistry {
  notify(): void;
  register(layer: GpuPointCloud3dPickLayer): () => void;
  snapshot(): readonly GpuPointCloud3dPickLayer[];
  subscribe(listener: () => void): () => void;
}

/** React context publishing the picker registry for one 3D canvas. */
export const GpuPointCloud3dPickerRegistryContext =
  createContext<GpuPointCloud3dPickerRegistry | null>(null);

/** Mutable canvas-local registry; updates invalidate in-flight readbacks. */
export function createGpuPointCloud3dPickerRegistry(): GpuPointCloud3dPickerRegistry {
  const layers = new Map<string, GpuPointCloud3dPickLayer>();
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    notify: publish,
    register: (layer) => {
      layers.set(layer.layerId, layer);
      publish();
      let registered = true;
      return () => {
        if (!registered) {
          return;
        }
        registered = false;
        if (layers.get(layer.layerId) === layer) {
          layers.delete(layer.layerId);
          publish();
        }
      };
    },
    snapshot: () => Array.from(layers.values()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Camera, ray, and viewport state for one 3D GPU pick. */
export interface GpuPointCloud3dPickRequest {
  readonly camera: THREE.Camera;
  readonly far: number;
  readonly near: number;
  readonly pointerNdc: THREE.Vector2;
  readonly radiusPx: number;
  readonly rayDirection: THREE.Vector3;
  readonly rayOrigin: THREE.Vector3;
  readonly raycasterLayers: THREE.Layers;
  readonly viewportHeightPx: number;
  readonly viewportWidthPx: number;
}

/** Winning 3D cloud point returned by the GPU pick pass. */
export interface GpuPointCloud3dPickResult {
  readonly color: readonly [number, number, number] | null;
  readonly layerId: string;
  readonly resourceKey: string;
  /** Canonical prepared-sample index, before sourceIndices remapping. */
  readonly sampleIndex: number;
  readonly worldPosition: readonly [number, number, number];
}

/** Imperative lifecycle and picking API for the 3D point picker. */
export interface GpuPointCloud3dPickerController {
  dispose(): void;
  invalidate(): void;
  pick(
    request: GpuPointCloud3dPickRequest,
  ): Promise<GpuPointCloud3dPickResult | null>;
  setScene(layers: readonly GpuPointCloud3dPickLayer[]): void;
}

/** Creates the imperative picker used by the dwell layer and unit tests. */
export function createGpuPointCloud3dPickerController(
  renderer: unknown,
): GpuPointCloud3dPickerController {
  if (!isGpuPickRenderer(renderer)) {
    throw new Error("GPU 3D point picking requires Three WebGPURenderer");
  }
  return new PointCloud3dPickerController(renderer);
}

class PointCloud3dPickerController implements GpuPointCloud3dPickerController {
  private disposed = false;
  private generation = 0;
  private readonly readback: GpuPickReadbackLease;
  private renderPass: PointCloud3dPickPass | null = null;
  private readonly target: GpuPickRenderTarget;

  constructor(renderer: GpuPickRenderer) {
    this.readback = acquireGpuPickReadbackPool(renderer);
    this.target = new GpuPickRenderTarget(renderer);
  }

  setScene(layers: readonly GpuPointCloud3dPickLayer[]): void {
    if (this.disposed) {
      return;
    }
    this.invalidate();
    if (this.renderPass?.updateScene(layers)) {
      return;
    }
    const previousPass = this.renderPass;
    this.renderPass = null;
    try {
      this.renderPass = createPointCloud3dPickPass(layers);
    } finally {
      previousPass?.dispose();
    }
  }

  invalidate(): void {
    this.generation += 1;
  }

  async pick(
    request: GpuPointCloud3dPickRequest,
  ): Promise<GpuPointCloud3dPickResult | null> {
    const generation = ++this.generation;
    const renderPass = this.renderPass;
    if (
      this.disposed ||
      !renderPass ||
      renderPass.layers.length === 0 ||
      !validPickRequest(request)
    ) {
      return null;
    }
    renderPass.updateRequest(request);

    let pixels: ArrayBufferView;
    try {
      pixels = await this.target.renderAndRead(
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
    if (generation !== this.generation || this.disposed) {
      return null;
    }
    if (!(pixels instanceof Uint32Array) || pixels.length < 2) {
      throw new Error("GPU 3D point picker returned a non-integer texel");
    }

    const encodedLayerIndex = pixels[0];
    const encodedSampleIndex = pixels[1];
    if (encodedLayerIndex === 0 || encodedSampleIndex === 0) {
      return null;
    }
    const activeLayer = renderPass.layers[encodedLayerIndex - 1];
    const sampleIndex = encodedSampleIndex - 1;
    if (!activeLayer || sampleIndex >= activeLayer.sampledPointCount) {
      return null;
    }
    const worldPosition = pointCloud3dPickWorldPosition(
      activeLayer.source,
      sampleIndex,
      activeLayer.worldMatrixSnapshot,
    );
    if (!worldPosition) {
      return null;
    }

    return {
      color: pointCloud3dPickColor(activeLayer.source, sampleIndex),
      layerId: activeLayer.source.layerId,
      resourceKey: activeLayer.source.resourceKey,
      sampleIndex,
      worldPosition,
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

interface ActivePointCloud3dPickLayer {
  sampledPointCount: number;
  readonly sampleStride: PickUniformNode<number>;
  source: GpuPointCloud3dPickLayer;
  readonly sprite: THREE.Sprite;
  readonly visible: PickUniformNode<number>;
  readonly worldMatrix: PickUniformNode<THREE.Matrix4>;
  readonly worldMatrixSnapshot: THREE.Matrix4;
}

interface PointCloud3dPickPass {
  readonly dispose: () => void;
  readonly layers: readonly ActivePointCloud3dPickLayer[];
  readonly scene: THREE.Scene;
  readonly updateRequest: (request: GpuPointCloud3dPickRequest) => void;
  readonly updateScene: (
    layers: readonly GpuPointCloud3dPickLayer[],
  ) => boolean;
}

function createPointCloud3dPickPass(
  sourceLayers: readonly GpuPointCloud3dPickLayer[],
): PointCloud3dPickPass {
  const scene = new THREE.Scene();
  const materials: PointsNodeMaterial[] = [];
  const layers: ActivePointCloud3dPickLayer[] = [];
  const viewProjection = pickTsl.uniform(new THREE.Matrix4());
  const pointerNdc = pickTsl.uniform(new THREE.Vector2());
  const viewport = pickTsl.uniform(new THREE.Vector2(1, 1));
  const rayOrigin = pickTsl.uniform(new THREE.Vector3());
  const rayDirection = pickTsl.uniform(new THREE.Vector3(0, 0, -1));
  const near = pickTsl.uniform<number>(0);
  const far = pickTsl.uniform<number>(MAX_PICK_DISTANCE);
  const radius = pickTsl.uniform<number>(1);
  const cameraWorldInverse = new THREE.Matrix4();

  const dispose = () => {
    for (const material of materials) {
      material.dispose();
    }
  };

  try {
    for (const {
      renderedPointCount,
      sampledPointCount,
      source,
    } of activePickLayers(sourceLayers)) {
      const worldMatrix = pickTsl.uniform(new THREE.Matrix4());
      const visible = pickTsl.uniform(1);
      const sampleStride = pickTsl.uniform(
        Math.fround(sampledPointCount / renderedPointCount),
      );
      const sampleIndex = gpuPointCloudSampleIndexFromStrideNode(sampleStride);
      const material = createPointCloud3dPickMaterialNode({
        activeLayerIndex: layers.length,
        far,
        near,
        pointerNdc,
        positionAttribute: source.positionAttribute,
        positionLayout: source.positionLayout,
        radius,
        rayDirection,
        rayOrigin,
        sampleIndex: sampleIndex as PickSampleIndexNode,
        viewProjection,
        viewport,
        visible,
        worldMatrix,
      });
      const sprite = new THREE.Sprite(
        material as unknown as THREE.SpriteMaterial,
      );
      sprite.count = renderedPointCount;
      sprite.frustumCulled = false;
      scene.add(sprite);
      materials.push(material);
      layers.push({
        sampledPointCount,
        sampleStride,
        source,
        sprite,
        visible,
        worldMatrix,
        worldMatrixSnapshot: new THREE.Matrix4(),
      });
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    dispose,
    layers,
    scene,
    updateScene: (nextSourceLayers) => {
      const nextLayers = activePickLayers(nextSourceLayers);
      if (
        nextLayers.length !== layers.length ||
        nextLayers.some(
          ({ source }, index) =>
            source.positionAttribute !==
              layers[index].source.positionAttribute ||
            source.positionLayout !== layers[index].source.positionLayout,
        )
      ) {
        return false;
      }

      for (let index = 0; index < layers.length; index++) {
        const layer = layers[index];
        const next = nextLayers[index];
        layer.source = next.source;
        layer.sampledPointCount = next.sampledPointCount;
        layer.sampleStride.value = Math.fround(
          next.sampledPointCount / next.renderedPointCount,
        );
        layer.sprite.count = next.renderedPointCount;
      }
      return true;
    },
    updateRequest: (request) => {
      request.camera.updateWorldMatrix(true, false);
      cameraWorldInverse.copy(request.camera.matrixWorld).invert();
      viewProjection.value.multiplyMatrices(
        request.camera.projectionMatrix,
        cameraWorldInverse,
      );
      pointerNdc.value.copy(request.pointerNdc);
      viewport.value.set(request.viewportWidthPx, request.viewportHeightPx);
      rayOrigin.value.copy(request.rayOrigin);
      rayDirection.value.copy(request.rayDirection).normalize();
      near.value = normalizedNear(request.near);
      far.value = normalizedFar(request.far, near.value);
      radius.value = request.radiusPx;

      for (const layer of layers) {
        layer.source.object.updateWorldMatrix(true, false);
        layer.worldMatrix.value.copy(layer.source.object.matrixWorld);
        layer.worldMatrixSnapshot.copy(layer.worldMatrix.value);
        layer.visible.value = layer.source.object.layers.test(
          request.raycasterLayers,
        )
          ? 1
          : 0;
      }
    },
  };
}

function activePickLayers(sourceLayers: readonly GpuPointCloud3dPickLayer[]): {
  readonly renderedPointCount: number;
  readonly sampledPointCount: number;
  readonly source: GpuPointCloud3dPickLayer;
}[] {
  const active = [];
  for (const source of sourceLayers) {
    const availablePointCount =
      source.positionLayout === "flat"
        ? Math.floor(source.positionAttribute.count / 3)
        : source.positionAttribute.count;
    const sampledPointCount = Math.min(
      availablePointCount,
      normalizedCount(source.sampledPointCount),
    );
    const renderedPointCount = Math.min(
      sampledPointCount,
      normalizedCount(source.renderedPointCount),
    );
    if (sampledPointCount > 0 && renderedPointCount > 0) {
      active.push({ renderedPointCount, sampledPointCount, source });
    }
  }
  return active;
}

/** Builds the integer-output material for one 3D point-cloud pick layer. */
export function createPointCloud3dPickMaterial({
  activeLayerIndex,
  far,
  near,
  pointerNdc,
  positionAttribute,
  positionLayout,
  radiusPx,
  rayDirection,
  rayOrigin,
  renderedPointCount,
  sampledPointCount,
  viewProjection,
  viewport,
  visible,
  worldMatrix,
}: {
  readonly activeLayerIndex: number;
  readonly far: number;
  readonly near: number;
  readonly pointerNdc: THREE.Vector2;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly positionLayout: GpuPointCloudPositionLayout;
  readonly radiusPx: number;
  readonly rayDirection: THREE.Vector3;
  readonly rayOrigin: THREE.Vector3;
  readonly renderedPointCount: number;
  readonly sampledPointCount: number;
  readonly viewProjection: THREE.Matrix4;
  readonly viewport: THREE.Vector2;
  readonly visible?: boolean;
  readonly worldMatrix: THREE.Matrix4;
}): PickPointsMaterial {
  return createPointCloud3dPickMaterialNode({
    activeLayerIndex,
    far: pickTsl.uniform(far),
    near: pickTsl.uniform(near),
    pointerNdc: pickTsl.uniform(pointerNdc.clone()),
    positionAttribute,
    positionLayout,
    radius: pickTsl.uniform(radiusPx),
    rayDirection: pickTsl.uniform(rayDirection.clone()),
    rayOrigin: pickTsl.uniform(rayOrigin.clone()),
    sampleIndex: gpuPointCloudSampleIndexNode(
      sampledPointCount,
      renderedPointCount,
    ) as PickSampleIndexNode,
    viewProjection: pickTsl.uniform(viewProjection.clone()),
    viewport: pickTsl.uniform(viewport.clone()),
    visible: pickTsl.uniform(visible === false ? 0 : 1),
    worldMatrix: pickTsl.uniform(worldMatrix.clone()),
  });
}

function createPointCloud3dPickMaterialNode({
  activeLayerIndex,
  far,
  near,
  pointerNdc,
  positionAttribute,
  positionLayout,
  radius,
  rayDirection,
  rayOrigin,
  sampleIndex,
  viewProjection,
  viewport,
  visible,
  worldMatrix,
}: {
  readonly activeLayerIndex: number;
  readonly far: PickUniformNode<number>;
  readonly near: PickUniformNode<number>;
  readonly pointerNdc: PickUniformNode<THREE.Vector2>;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly positionLayout: GpuPointCloudPositionLayout;
  readonly radius: PickUniformNode<number>;
  readonly rayDirection: PickUniformNode<THREE.Vector3>;
  readonly rayOrigin: PickUniformNode<THREE.Vector3>;
  readonly sampleIndex: PickSampleIndexNode;
  readonly viewProjection: PickUniformNode<THREE.Matrix4>;
  readonly viewport: PickUniformNode<THREE.Vector2>;
  readonly visible: PickUniformNode<number>;
  readonly worldMatrix: PickUniformNode<THREE.Matrix4>;
}): PickPointsMaterial {
  const material = new PointsNodeMaterial({
    size: 1,
    sizeAttenuation: false,
  }) as PickPointsMaterial;
  material.alphaToCoverage = false;
  material.blending = THREE.NoBlending;
  material.depthFunc = THREE.LessDepth;
  material.depthTest = true;
  material.depthWrite = true;
  material.fog = false;
  material.toneMapped = false;

  const localPosition = gpuPointCloudPositionNode(
    positionAttribute,
    positionLayout,
    sampleIndex,
  ) as unknown as PickNode;
  const worldPosition = worldMatrix.mul(pickTsl.vec4(localPosition, 1));
  const clipPosition = viewProjection.mul(worldPosition);
  const ndcX = clipPosition.x.div(clipPosition.w);
  const ndcY = clipPosition.y.div(clipPosition.w);
  const dx = ndcX.sub(pointerNdc.x).mul(viewport.x).mul(0.5);
  const dy = ndcY.sub(pointerNdc.y).mul(viewport.y).mul(0.5);
  const distanceSq = dx.mul(dx).add(dy.mul(dy));
  const radiusSq = radius.mul(radius);
  const rayDistance = worldPosition.xyz.sub(rayOrigin).dot(rayDirection);
  const pickable = pickTsl.and(
    pickTsl.greaterThan(visible, 0.5),
    pickTsl.greaterThan(clipPosition.w, MIN_CLIP_W),
    pickTsl.greaterThanEqual(rayDistance, near),
    pickTsl.lessThanEqual(rayDistance, far),
    pickTsl.lessThanEqual(distanceSq, radiusSq),
  );

  material.positionNode = pickTsl.select(
    pickable,
    pickTsl.vec3(0, 0, 0),
    pickTsl.vec3(CULLED_POSITION, CULLED_POSITION, 0),
  ) as unknown as TSL.Node;
  material.scaleNode = pickTsl.select(
    pickable,
    pickTsl.vec2(1, 1),
    pickTsl.vec2(0, 0),
  );
  material.depthNode = pickTsl.clamp(
    rayDistance.div(rayDistance.add(1)),
    0,
    1,
  ) as unknown as TSL.Node;
  material.fragmentNode = pickTsl.uvec4(
    pickTsl.uint(activeLayerIndex + 1),
    sampleIndex.add(1) as unknown as PickNode,
    pickTsl.uint(0),
    pickTsl.uint(1),
  ) as unknown as TSL.Node;

  return material;
}

/** O(1) CPU reconstruction after the integer readback names one sample. */
export function pointCloud3dPickWorldPosition(
  layer: GpuPointCloud3dPickLayer,
  sampleIndex: number,
  worldMatrix: THREE.Matrix4,
): readonly [number, number, number] | null {
  if (!validSampleIndex(layer, sampleIndex)) {
    return null;
  }
  const position = new THREE.Vector3();
  if (layer.positionLayout === "flat") {
    const offset = sampleIndex * 3;
    position.set(
      layer.positionAttribute.getX(offset),
      layer.positionAttribute.getX(offset + 1),
      layer.positionAttribute.getX(offset + 2),
    );
  } else {
    position.fromBufferAttribute(layer.positionAttribute, sampleIndex);
  }
  position.applyMatrix4(worldMatrix);
  return [position.x, position.y, position.z];
}

/** Reads legacy precomputed RGB; decoder payload colors resolve separately. */
export function pointCloud3dPickColor(
  layer: GpuPointCloud3dPickLayer,
  sampleIndex: number,
): readonly [number, number, number] | null {
  const color = layer.colorAttribute;
  if (
    !color ||
    !validSampleIndex(layer, sampleIndex) ||
    sampleIndex >= color.count
  ) {
    return null;
  }
  return [
    color.getX(sampleIndex),
    color.getY(sampleIndex),
    color.getZ(sampleIndex),
  ];
}

function validSampleIndex(
  layer: GpuPointCloud3dPickLayer,
  sampleIndex: number,
): boolean {
  if (
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= normalizedCount(layer.sampledPointCount)
  ) {
    return false;
  }
  return layer.positionLayout === "flat"
    ? sampleIndex * 3 + 2 < layer.positionAttribute.count
    : sampleIndex < layer.positionAttribute.count;
}

function validPickRequest(request: GpuPointCloud3dPickRequest): boolean {
  return (
    Number.isFinite(request.radiusPx) &&
    request.radiusPx > 0 &&
    Number.isFinite(request.viewportWidthPx) &&
    request.viewportWidthPx > 0 &&
    Number.isFinite(request.viewportHeightPx) &&
    request.viewportHeightPx > 0 &&
    Number.isFinite(request.pointerNdc.x) &&
    Number.isFinite(request.pointerNdc.y)
  );
}

function normalizedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizedNear(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizedFar(value: number, near: number): number {
  return Number.isFinite(value) ? Math.max(near, value) : MAX_PICK_DISTANCE;
}

const PICK_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
PICK_CAMERA.position.set(0, 0, 1);
PICK_CAMERA.updateProjectionMatrix();
